package marketdata

import (
	"fmt"
	"strings"
)

// Market identifies an exchange product family.
type Market string

const (
	MarketSpot    Market = "spot"
	MarketFutures Market = "futures"
)

func ParseMarket(value string) (Market, error) {
	market := Market(strings.ToLower(strings.TrimSpace(value)))
	switch market {
	case MarketSpot, MarketFutures:
		return market, nil
	default:
		return "", fmt.Errorf("unsupported market %q", value)
	}
}

type Subscription struct {
	Provider string `json:"provider"`
	Market   Market `json:"market"`
	Symbol   string `json:"symbol"`
	Interval string `json:"interval"`
}

type Symbol struct {
	Provider          string `json:"provider"`
	Market            Market `json:"market"`
	Symbol            string `json:"symbol"`
	BaseAsset         string `json:"baseAsset"`
	QuoteAsset        string `json:"quoteAsset"`
	Status            string `json:"status"`
	PricePrecision    int    `json:"pricePrecision"`
	QuantityPrecision int    `json:"quantityPrecision"`
}

// MarketPair combines the static exchange definition with a 24-hour market
// snapshot. Providers normalize their native ticker payloads into this type so
// the frontend can search and sort catalogs without exchange-specific logic.
type MarketPair struct {
	Provider             string  `json:"provider"`
	Market               Market  `json:"market"`
	Symbol               string  `json:"symbol"`
	BaseAsset            string  `json:"baseAsset"`
	QuoteAsset           string  `json:"quoteAsset"`
	Status               string  `json:"status"`
	PricePrecision       int     `json:"pricePrecision"`
	QuantityPrecision    int     `json:"quantityPrecision"`
	LastPrice            float64 `json:"lastPrice"`
	PriceChange          float64 `json:"priceChange"`
	PriceChangePercent   float64 `json:"priceChangePercent"`
	WeightedAveragePrice float64 `json:"weightedAveragePrice"`
	OpenPrice            float64 `json:"openPrice"`
	HighPrice            float64 `json:"highPrice"`
	LowPrice             float64 `json:"lowPrice"`
	Volume               float64 `json:"volume"`
	QuoteVolume          float64 `json:"quoteVolume"`
	TradeCount           int64   `json:"tradeCount"`
}

// MarketCatalog is a cache-aware snapshot of the pairs exposed by a provider.
// Timestamps use Unix milliseconds because this metadata is consumed by the
// desktop UI rather than the Lightweight Charts time scale.
type MarketCatalog struct {
	Provider   string       `json:"provider"`
	Market     Market       `json:"market"`
	QuoteAsset string       `json:"quoteAsset,omitempty"`
	Items      []MarketPair `json:"items"`
	LoadedAt   int64        `json:"loadedAt"`
	ExpiresAt  int64        `json:"expiresAt"`
	Cached     bool         `json:"cached"`
	Stale      bool         `json:"stale"`
	Warning    string       `json:"warning,omitempty"`
}

type Candle struct {
	Provider    string  `json:"provider"`
	Market      Market  `json:"market"`
	Symbol      string  `json:"symbol"`
	Interval    string  `json:"interval"`
	Time        int64   `json:"time"`
	CloseTime   int64   `json:"closeTime"`
	Open        float64 `json:"open"`
	High        float64 `json:"high"`
	Low         float64 `json:"low"`
	Close       float64 `json:"close"`
	Volume      float64 `json:"volume"`
	QuoteVolume float64 `json:"quoteVolume"`
	Closed      bool    `json:"closed"`
}

type OrderBookLevel struct {
	Price    float64 `json:"price"`
	Quantity float64 `json:"quantity"`
	Total    float64 `json:"total"`
}

type OrderBookSnapshot struct {
	Provider     string           `json:"provider"`
	Market       Market           `json:"market"`
	Symbol       string           `json:"symbol"`
	EventTime    int64            `json:"eventTime"`
	LastUpdateID int64            `json:"lastUpdateId"`
	Bids         []OrderBookLevel `json:"bids"`
	Asks         []OrderBookLevel `json:"asks"`
	MidPrice     float64          `json:"midPrice"`
	Spread       float64          `json:"spread"`
}

type StreamStatus struct {
	Provider       string `json:"provider"`
	Market         Market `json:"market"`
	Symbol         string `json:"symbol"`
	State          string `json:"state"`
	CandleState    string `json:"candleState"`
	OrderBookState string `json:"orderBookState"`
	Message        string `json:"message,omitempty"`
}

// ConnectionState reports the lifecycle of one provider WebSocket.
type ConnectionState struct {
	State   string
	Message string
}
