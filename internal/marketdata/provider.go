package marketdata

import "context"

// Provider is the exchange-neutral market-data contract.
// Implementations own endpoint details and translate exchange payloads into
// the shared domain types above.
type Provider interface {
	Name() string
	Symbols(
		ctx context.Context,
		market Market,
		quoteAsset string,
	) ([]Symbol, error)
	Candles(
		ctx context.Context,
		market Market,
		symbol string,
		interval string,
		limit int,
	) ([]Candle, error)
	StreamCandles(
		ctx context.Context,
		market Market,
		symbol string,
		interval string,
		onCandle func(Candle),
		onState func(ConnectionState),
	) error
	StreamOrderBook(
		ctx context.Context,
		market Market,
		symbol string,
		onSnapshot func(OrderBookSnapshot),
		onState func(ConnectionState),
	) error
}
