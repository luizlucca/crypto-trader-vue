package marketdata

import "testing"

func TestOfferLatestReplacesPendingSnapshot(t *testing.T) {
	t.Parallel()

	updates := make(chan OrderBookSnapshot, 1)
	offerLatest(updates, OrderBookSnapshot{LastUpdateID: 1})
	offerLatest(updates, OrderBookSnapshot{LastUpdateID: 2})

	got := <-updates
	if got.LastUpdateID != 2 {
		t.Fatalf("got update %d, want latest update 2", got.LastUpdateID)
	}
}

func TestSessionHealthOnlyConnectsAfterBothStreams(t *testing.T) {
	t.Parallel()

	var statuses []StreamStatus
	health := newSessionHealth(
		Subscription{
			Provider: "binance",
			Market:   MarketFutures,
			Symbol:   "BTCUSDT",
			Interval: "1m",
		},
		func(status StreamStatus) {
			statuses = append(statuses, status)
		},
	)

	health.update(streamCandles, ConnectionState{State: "connected"})
	if statuses[len(statuses)-1].State == "connected" {
		t.Fatal("session must not connect before the order book is connected")
	}

	health.update(streamOrderBook, ConnectionState{State: "connected"})
	if statuses[len(statuses)-1].State != "connected" {
		t.Fatalf("session state = %q, want connected", statuses[len(statuses)-1].State)
	}
}
