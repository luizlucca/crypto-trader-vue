package binance

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"crypto-trader-vue/internal/marketdata"
)

const (
	liveStreamCandles   = "candles"
	liveStreamOrderBook = "orderbook"
)

type liveEvent struct {
	stream   string
	state    string
	message  string
	candle   *marketdata.Candle
	snapshot *marketdata.OrderBookSnapshot
	err      error
}

func TestLiveMarketData(t *testing.T) {
	if os.Getenv("BINANCE_LIVE_TEST") != "1" {
		t.Skip("set BINANCE_LIVE_TEST=1 to run against Binance public APIs")
	}

	for _, market := range []marketdata.Market{
		marketdata.MarketSpot,
		marketdata.MarketFutures,
	} {
		market := market
		t.Run(string(market), func(t *testing.T) {
			client := New()
			ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			defer cancel()

			assertLiveREST(t, ctx, client, market)

			events := make(chan liveEvent, 32)
			streamCtx, stopStreams := context.WithCancel(ctx)
			defer stopStreams()

			go func() {
				err := client.StreamCandles(
					streamCtx,
					market,
					"BTCUSDT",
					"1m",
					func(candle marketdata.Candle) {
						emitLiveEvent(events, liveEvent{
							stream: liveStreamCandles,
							candle: &candle,
						})
					},
					func(state marketdata.ConnectionState) {
						emitLiveEvent(events, liveEvent{
							stream:  liveStreamCandles,
							state:   state.State,
							message: state.Message,
						})
					},
				)
				emitLiveEvent(events, liveEvent{stream: liveStreamCandles, err: err})
			}()

			go func() {
				err := client.StreamOrderBook(
					streamCtx,
					market,
					"BTCUSDT",
					func(snapshot marketdata.OrderBookSnapshot) {
						emitLiveEvent(events, liveEvent{
							stream:   liveStreamOrderBook,
							snapshot: &snapshot,
						})
					},
					func(state marketdata.ConnectionState) {
						emitLiveEvent(events, liveEvent{
							stream:  liveStreamOrderBook,
							state:   state.State,
							message: state.Message,
						})
					},
				)
				emitLiveEvent(events, liveEvent{stream: liveStreamOrderBook, err: err})
			}()

			waitForBothLiveStreams(t, ctx, events)
		})
	}
}

func emitLiveEvent(events chan liveEvent, event liveEvent) {
	select {
	case events <- event:
	default:
	}
}

func assertLiveREST(
	t *testing.T,
	ctx context.Context,
	client *Client,
	market marketdata.Market,
) {
	t.Helper()

	symbols, err := client.Symbols(ctx, market, "USDT")
	if err != nil {
		t.Fatalf("load symbols: %v", err)
	}
	if len(symbols) == 0 {
		t.Fatal("expected at least one USDT symbol")
	}

	candles, err := client.Candles(ctx, market, "BTCUSDT", "1m", 2)
	if err != nil {
		t.Fatalf("load candles: %v", err)
	}
	if len(candles) != 2 {
		t.Fatalf("got %d candles, want 2", len(candles))
	}
}

func waitForBothLiveStreams(
	t *testing.T,
	ctx context.Context,
	events <-chan liveEvent,
) {
	t.Helper()

	var gotCandle bool
	var gotBook bool
	var states []string

	for !gotCandle || !gotBook {
		select {
		case event := <-events:
			if event.state != "" {
				states = append(
					states,
					fmt.Sprintf("%s=%s(%s)", event.stream, event.state, event.message),
				)
			}
			if event.err != nil {
				t.Fatalf("%s stream ended early: %v", event.stream, event.err)
			}
			if event.candle != nil {
				if event.candle.Close <= 0 {
					t.Fatalf("invalid live candle: %#v", event.candle)
				}
				gotCandle = true
			}
			if event.snapshot != nil {
				if len(event.snapshot.Bids) == 0 || len(event.snapshot.Asks) == 0 {
					t.Fatalf("invalid live order book: %#v", event.snapshot)
				}
				gotBook = true
			}
		case <-ctx.Done():
			t.Fatalf(
				"timed out waiting for live streams (candle=%t book=%t): %v",
				gotCandle,
				gotBook,
				states,
			)
		}
	}
}
