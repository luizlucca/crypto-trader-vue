package binance

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"crypto-trader-vue/internal/marketdata"
)

func TestCatalogCacheTTLIsOneHour(t *testing.T) {
	t.Parallel()

	if catalogCacheTTL != time.Hour {
		t.Fatalf("catalog cache TTL = %s, want 1h", catalogCacheTTL)
	}
}

func TestCatalogFiltersQuoteAssetWithoutRefetching(t *testing.T) {
	t.Parallel()

	now := time.Now()
	client := New()
	client.catalogs[marketdata.MarketSpot] = catalogCacheEntry{
		loadedAt:  now,
		expiresAt: now.Add(catalogCacheTTL),
		items: []marketdata.MarketPair{
			{Symbol: "BTCUSDT", QuoteAsset: "USDT"},
			{Symbol: "BTCEUR", QuoteAsset: "EUR"},
		},
	}

	catalog, err := client.Catalog(
		context.Background(),
		marketdata.MarketSpot,
		"usdt",
		false,
	)
	if err != nil {
		t.Fatal(err)
	}
	if !catalog.Cached || catalog.Stale {
		t.Fatalf("unexpected cache flags: %#v", catalog)
	}
	if len(catalog.Items) != 1 || catalog.Items[0].Symbol != "BTCUSDT" {
		t.Fatalf("unexpected filtered catalog: %#v", catalog.Items)
	}
}

func TestMergeCatalogAddsTickerStatistics(t *testing.T) {
	t.Parallel()

	symbols := []marketdata.Symbol{{
		Provider:          providerName,
		Market:            marketdata.MarketFutures,
		Symbol:            "BTCUSDT",
		BaseAsset:         "BTC",
		QuoteAsset:        "USDT",
		Status:            "TRADING",
		PricePrecision:    2,
		QuantityPrecision: 3,
	}}
	tickers := map[string]ticker24h{
		"BTCUSDT": {
			LastPrice:          float64Value(67000),
			PriceChangePercent: float64Value(2.5),
			QuoteVolume:        float64Value(1_500_000),
			TradeCount:         int64Value(42),
		},
	}

	items := mergeCatalog(symbols, tickers)
	if len(items) != 1 {
		t.Fatalf("got %d items, want 1", len(items))
	}
	item := items[0]
	if item.LastPrice != 67000 ||
		item.PriceChangePercent != 2.5 ||
		item.QuoteVolume != 1_500_000 ||
		item.TradeCount != 42 {
		t.Fatalf("unexpected merged pair: %#v", item)
	}
}

func TestEndpointsAreSeparatedByMarket(t *testing.T) {
	t.Parallel()

	spot, err := endpointsFor(marketdata.MarketSpot)
	if err != nil {
		t.Fatal(err)
	}
	futures, err := endpointsFor(marketdata.MarketFutures)
	if err != nil {
		t.Fatal(err)
	}

	if spot.rest == futures.rest ||
		spot.wsPublic == futures.wsPublic ||
		spot.wsMarket == futures.wsMarket {
		t.Fatalf("spot and futures endpoints must be distinct: %#v %#v", spot, futures)
	}
	if futures.wsPublic == futures.wsMarket {
		t.Fatal("futures public and regular-market WebSockets must be separated")
	}
}

func TestPrecisionFromIncrement(t *testing.T) {
	t.Parallel()

	tests := map[string]int{
		"1.00000000": 0,
		"0.10000000": 1,
		"0.01000000": 2,
		"0.00001000": 5,
	}
	for input, want := range tests {
		if got := precisionFromIncrement(input); got != want {
			t.Fatalf("precisionFromIncrement(%q) = %d, want %d", input, got, want)
		}
	}
}

func TestKlineEventSeparatesCaseSensitiveEventFields(t *testing.T) {
	t.Parallel()

	payload := `{
		"e": "kline",
		"E": "1700000000123",
		"s": "BTCUSDT",
		"k": {
			"t": "1700000000000",
			"T": "1700000059999",
			"i": "1m",
			"o": "100.0",
			"c": "101.0",
			"h": "102.0",
			"l": 99.0,
			"v": "10.0",
			"q": "1005.0",
			"x": false
		}
	}`

	var event klineEvent
	if err := json.Unmarshal([]byte(payload), &event); err != nil {
		t.Fatal(err)
	}
	if event.EventType != "kline" || int64(event.EventTime) != 1700000000123 {
		t.Fatalf("unexpected event headers: %#v", event)
	}
	candle, err := event.candle(marketdata.MarketFutures)
	if err != nil {
		t.Fatal(err)
	}
	if candle.Time != 1700000000 || candle.Close != 101 {
		t.Fatalf("unexpected candle: %#v", candle)
	}
}

func TestDepthEventSnapshotSupportsSpotAndFuturesPayloads(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		payload string
		market  marketdata.Market
		wantID  int64
	}{
		{
			name: "spot",
			payload: `{
				"lastUpdateId": 42,
				"bids": [["100.00", "2.0"], ["99.00", "3.0"]],
				"asks": [["101.00", "1.5"], ["102.00", "4.0"]]
			}`,
			market: marketdata.MarketSpot,
			wantID: 42,
		},
		{
			name: "futures",
			payload: `{
				"e": "depthUpdate",
				"E": "1700000000000",
				"s": "BTCUSDT",
				"u": "84",
				"b": [["100.00", "2.0"]],
				"a": [["101.00", "1.5"]]
			}`,
			market: marketdata.MarketFutures,
			wantID: 84,
		},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			var event depthEvent
			if err := json.Unmarshal([]byte(test.payload), &event); err != nil {
				t.Fatal(err)
			}
			snapshot, err := event.snapshot(test.market, "BTCUSDT")
			if err != nil {
				t.Fatal(err)
			}

			if snapshot.LastUpdateID != test.wantID {
				t.Fatalf("LastUpdateID = %d, want %d", snapshot.LastUpdateID, test.wantID)
			}
			if snapshot.MidPrice != 100.5 || snapshot.Spread != 1 {
				t.Fatalf(
					"unexpected mid/spread: mid=%f spread=%f",
					snapshot.MidPrice,
					snapshot.Spread,
				)
			}
			if snapshot.Bids[len(snapshot.Bids)-1].Total < snapshot.Bids[0].Quantity {
				t.Fatal("cumulative total must not decrease")
			}
		})
	}
}
