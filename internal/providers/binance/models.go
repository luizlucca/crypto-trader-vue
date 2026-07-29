package binance

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"crypto-trader-vue/internal/marketdata"
)

type int64Value int64

func (value *int64Value) UnmarshalJSON(data []byte) error {
	normalized := bytes.Trim(data, `"`)
	parsed, err := strconv.ParseInt(string(normalized), 10, 64)
	if err != nil {
		return err
	}
	*value = int64Value(parsed)
	return nil
}

type float64Value float64

func (value *float64Value) UnmarshalJSON(data []byte) error {
	normalized := bytes.Trim(data, `"`)
	parsed, err := strconv.ParseFloat(string(normalized), 64)
	if err != nil {
		return err
	}
	*value = float64Value(parsed)
	return nil
}

type klineEvent struct {
	EventType string     `json:"e"`
	EventTime int64Value `json:"E"`
	Symbol    string     `json:"s"`
	Kline     struct {
		StartTime   int64Value   `json:"t"`
		CloseTime   int64Value   `json:"T"`
		Interval    string       `json:"i"`
		Open        float64Value `json:"o"`
		Close       float64Value `json:"c"`
		High        float64Value `json:"h"`
		Low         float64Value `json:"l"`
		Volume      float64Value `json:"v"`
		QuoteVolume float64Value `json:"q"`
		Closed      bool         `json:"x"`
	} `json:"k"`
}

type depthEvent struct {
	EventType     string     `json:"e"`
	EventTime     int64Value `json:"E"`
	Symbol        string     `json:"s"`
	LastUpdateID  int64Value `json:"lastUpdateId"`
	FinalUpdateID int64Value `json:"u"`
	Bids          [][]string `json:"bids"`
	Asks          [][]string `json:"asks"`
	ShortBids     [][]string `json:"b"`
	ShortAsks     [][]string `json:"a"`
}

func parseCandleRow(
	row []json.RawMessage,
	market marketdata.Market,
	symbol string,
	interval string,
) (marketdata.Candle, error) {
	if len(row) < 8 {
		return marketdata.Candle{}, fmt.Errorf("invalid binance candle row: got %d fields", len(row))
	}

	openTime, err := parseRawInt64(row[0])
	if err != nil {
		return marketdata.Candle{}, fmt.Errorf("parse candle open time: %w", err)
	}
	open, err := parseRawFloat(row[1])
	if err != nil {
		return marketdata.Candle{}, fmt.Errorf("parse candle open: %w", err)
	}
	high, err := parseRawFloat(row[2])
	if err != nil {
		return marketdata.Candle{}, fmt.Errorf("parse candle high: %w", err)
	}
	low, err := parseRawFloat(row[3])
	if err != nil {
		return marketdata.Candle{}, fmt.Errorf("parse candle low: %w", err)
	}
	closeValue, err := parseRawFloat(row[4])
	if err != nil {
		return marketdata.Candle{}, fmt.Errorf("parse candle close: %w", err)
	}
	volume, err := parseRawFloat(row[5])
	if err != nil {
		return marketdata.Candle{}, fmt.Errorf("parse candle volume: %w", err)
	}
	closeTime, err := parseRawInt64(row[6])
	if err != nil {
		return marketdata.Candle{}, fmt.Errorf("parse candle close time: %w", err)
	}
	quoteVolume, err := parseRawFloat(row[7])
	if err != nil {
		return marketdata.Candle{}, fmt.Errorf("parse candle quote volume: %w", err)
	}

	return marketdata.Candle{
		Provider:    providerName,
		Market:      market,
		Symbol:      symbol,
		Interval:    interval,
		Time:        openTime / 1000,
		CloseTime:   closeTime / 1000,
		Open:        open,
		High:        high,
		Low:         low,
		Close:       closeValue,
		Volume:      volume,
		QuoteVolume: quoteVolume,
		Closed:      closeTime < time.Now().UnixMilli(),
	}, nil
}

func (event klineEvent) candle(market marketdata.Market) (marketdata.Candle, error) {
	return marketdata.Candle{
		Provider:    providerName,
		Market:      market,
		Symbol:      event.Symbol,
		Interval:    event.Kline.Interval,
		Time:        int64(event.Kline.StartTime) / 1000,
		CloseTime:   int64(event.Kline.CloseTime) / 1000,
		Open:        float64(event.Kline.Open),
		High:        float64(event.Kline.High),
		Low:         float64(event.Kline.Low),
		Close:       float64(event.Kline.Close),
		Volume:      float64(event.Kline.Volume),
		QuoteVolume: float64(event.Kline.QuoteVolume),
		Closed:      event.Kline.Closed,
	}, nil
}

func parseRawFloat(value json.RawMessage) (float64, error) {
	var encoded string
	if err := json.Unmarshal(value, &encoded); err != nil {
		return 0, err
	}
	return strconv.ParseFloat(encoded, 64)
}

func parseRawInt64(value json.RawMessage) (int64, error) {
	var result int64
	if err := json.Unmarshal(value, &result); err != nil {
		return 0, err
	}
	return result, nil
}
