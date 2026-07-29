package binance

import (
	"encoding/json"
	"testing"

	"crypto-trader-vue/internal/marketdata"
)

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
