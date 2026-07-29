package binance

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"crypto-trader-vue/internal/marketdata"

	"github.com/gorilla/websocket"
)

func (c *Client) StreamCandles(
	ctx context.Context,
	market marketdata.Market,
	symbol string,
	interval string,
	onCandle func(marketdata.Candle),
	onState func(marketdata.ConnectionState),
) error {
	normalizedSymbol, err := validateSymbol(symbol)
	if err != nil {
		return err
	}
	if err := validateInterval(interval); err != nil {
		return err
	}
	target, err := endpointsFor(market)
	if err != nil {
		return err
	}

	streamURL := fmt.Sprintf(
		"%s/%s@kline_%s",
		target.wsMarket,
		strings.ToLower(normalizedSymbol),
		interval,
	)

	return c.consume(ctx, streamURL, onState, func(payload []byte) error {
		var event klineEvent
		if err := json.Unmarshal(payload, &event); err != nil {
			return fmt.Errorf("decode binance candle event: %w", err)
		}
		candle, err := event.candle(market)
		if err != nil {
			return fmt.Errorf("parse binance candle event: %w", err)
		}
		if onCandle != nil {
			onCandle(candle)
		}
		return nil
	})
}

func (c *Client) StreamOrderBook(
	ctx context.Context,
	market marketdata.Market,
	symbol string,
	onSnapshot func(marketdata.OrderBookSnapshot),
	onState func(marketdata.ConnectionState),
) error {
	normalizedSymbol, err := validateSymbol(symbol)
	if err != nil {
		return err
	}
	target, err := endpointsFor(market)
	if err != nil {
		return err
	}

	// Partial depth gives an exchange-built top-20 snapshot every 100 ms.
	// It avoids rebuilding the full local book when the UI only renders 12 rows.
	streamURL := fmt.Sprintf(
		"%s/%s@depth20@100ms",
		target.wsPublic,
		strings.ToLower(normalizedSymbol),
	)

	return c.consume(ctx, streamURL, onState, func(payload []byte) error {
		var event depthEvent
		if err := json.Unmarshal(payload, &event); err != nil {
			return fmt.Errorf("decode binance depth event: %w", err)
		}
		snapshot, err := event.snapshot(market, normalizedSymbol)
		if err != nil {
			return fmt.Errorf("parse binance depth event: %w", err)
		}
		if onSnapshot != nil {
			onSnapshot(snapshot)
		}
		return nil
	})
}

func (c *Client) consume(
	ctx context.Context,
	streamURL string,
	onState func(marketdata.ConnectionState),
	onMessage func([]byte) error,
) error {
	backoff := time.Second
	emitConnectionState(onState, "connecting", "")

	for {
		if err := ctx.Err(); err != nil {
			return nil
		}

		connection, _, err := c.dialer.DialContext(ctx, streamURL, nil)
		if err != nil {
			emitConnectionState(onState, "reconnecting", err.Error())
			if err := waitForRetry(ctx, backoff); err != nil {
				return nil
			}
			backoff = min(backoff*2, 15*time.Second)
			continue
		}

		backoff = time.Second
		emitConnectionState(onState, "connected", "")
		connection.SetReadLimit(1 << 20)
		closeOnCancel := make(chan struct{})
		go func() {
			select {
			case <-ctx.Done():
				_ = connection.Close()
			case <-closeOnCancel:
			}
		}()

		readErr := c.readMessages(ctx, connection, onMessage)
		close(closeOnCancel)
		_ = connection.Close()

		if ctx.Err() != nil {
			return nil
		}
		if readErr != nil {
			emitConnectionState(onState, "reconnecting", readErr.Error())
			if err := waitForRetry(ctx, backoff); err != nil {
				return nil
			}
			backoff = min(backoff*2, 15*time.Second)
		}
	}
}

func emitConnectionState(
	onState func(marketdata.ConnectionState),
	state string,
	message string,
) {
	if onState == nil {
		return
	}
	onState(marketdata.ConnectionState{State: state, Message: message})
}

func (c *Client) readMessages(
	ctx context.Context,
	connection *websocket.Conn,
	onMessage func([]byte) error,
) error {
	for {
		if ctx.Err() != nil {
			return nil
		}
		_, payload, err := connection.ReadMessage()
		if err != nil {
			return err
		}
		if err := onMessage(payload); err != nil {
			return err
		}
	}
}

func waitForRetry(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func (event depthEvent) snapshot(
	market marketdata.Market,
	symbol string,
) (marketdata.OrderBookSnapshot, error) {
	rawBids := event.Bids
	if len(rawBids) == 0 {
		rawBids = event.ShortBids
	}
	rawAsks := event.Asks
	if len(rawAsks) == 0 {
		rawAsks = event.ShortAsks
	}

	bids, err := parseLevels(rawBids)
	if err != nil {
		return marketdata.OrderBookSnapshot{}, err
	}
	asks, err := parseLevels(rawAsks)
	if err != nil {
		return marketdata.OrderBookSnapshot{}, err
	}

	lastUpdateID := int64(event.LastUpdateID)
	if event.FinalUpdateID != 0 {
		lastUpdateID = int64(event.FinalUpdateID)
	}
	eventTime := int64(event.EventTime)
	if eventTime == 0 {
		eventTime = time.Now().UnixMilli()
	}

	snapshot := marketdata.OrderBookSnapshot{
		Provider:     providerName,
		Market:       market,
		Symbol:       symbol,
		EventTime:    eventTime,
		LastUpdateID: lastUpdateID,
		Bids:         bids,
		Asks:         asks,
	}

	if len(bids) > 0 && len(asks) > 0 {
		bestBid := bids[0].Price
		bestAsk := asks[0].Price
		snapshot.MidPrice = (bestBid + bestAsk) / 2
		snapshot.Spread = math.Max(0, bestAsk-bestBid)
	}

	return snapshot, nil
}

func parseLevels(rawLevels [][]string) ([]marketdata.OrderBookLevel, error) {
	levels := make([]marketdata.OrderBookLevel, 0, len(rawLevels))
	var cumulative float64

	for _, rawLevel := range rawLevels {
		if len(rawLevel) < 2 {
			continue
		}
		price, err := strconv.ParseFloat(rawLevel[0], 64)
		if err != nil {
			return nil, err
		}
		quantity, err := strconv.ParseFloat(rawLevel[1], 64)
		if err != nil {
			return nil, err
		}
		cumulative += quantity
		levels = append(levels, marketdata.OrderBookLevel{
			Price:    price,
			Quantity: quantity,
			Total:    cumulative,
		})
	}
	return levels, nil
}
