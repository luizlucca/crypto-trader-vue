package marketdata

import (
	"context"
	"fmt"
	"strings"
	"sync"
)

const (
	streamCandles   = "candles"
	streamOrderBook = "orderbook"
)

type StreamHandlers struct {
	OnCandle    func(Candle)
	OnOrderBook func(OrderBookSnapshot)
	OnStatus    func(StreamStatus)
}

// Service owns the active market session. Candle and order-book streams run in
// separate goroutines and never share a delivery queue.
type Service struct {
	lifecycle sync.Mutex
	providers map[string]Provider
	cancel    context.CancelFunc
	wg        sync.WaitGroup
}

func NewService(providers ...Provider) *Service {
	registry := make(map[string]Provider, len(providers))
	for _, provider := range providers {
		registry[strings.ToLower(provider.Name())] = provider
	}
	return &Service{providers: registry}
}

func (s *Service) Symbols(
	ctx context.Context,
	providerName string,
	market Market,
	quoteAsset string,
) ([]Symbol, error) {
	provider, err := s.provider(providerName)
	if err != nil {
		return nil, err
	}
	return provider.Symbols(ctx, market, quoteAsset)
}

func (s *Service) Candles(
	ctx context.Context,
	providerName string,
	market Market,
	symbol string,
	interval string,
	limit int,
) ([]Candle, error) {
	provider, err := s.provider(providerName)
	if err != nil {
		return nil, err
	}
	return provider.Candles(ctx, market, symbol, interval, limit)
}

func (s *Service) Start(
	parent context.Context,
	subscription Subscription,
	handlers StreamHandlers,
) error {
	provider, err := s.provider(subscription.Provider)
	if err != nil {
		return err
	}

	s.lifecycle.Lock()
	defer s.lifecycle.Unlock()
	s.stopLocked()

	ctx, cancel := context.WithCancel(parent)
	s.cancel = cancel

	health := newSessionHealth(subscription, handlers.OnStatus)
	bookUpdates := make(chan OrderBookSnapshot, 1)

	s.wg.Add(3)
	go s.runStream(ctx, health, streamCandles, func() error {
		return provider.StreamCandles(
			ctx,
			subscription.Market,
			subscription.Symbol,
			subscription.Interval,
			handlers.OnCandle,
			func(state ConnectionState) {
				health.update(streamCandles, state)
			},
		)
	})

	go s.runStream(ctx, health, streamOrderBook, func() error {
		return provider.StreamOrderBook(
			ctx,
			subscription.Market,
			subscription.Symbol,
			func(snapshot OrderBookSnapshot) {
				offerLatest(bookUpdates, snapshot)
			},
			func(state ConnectionState) {
				health.update(streamOrderBook, state)
			},
		)
	})

	go s.dispatchOrderBook(ctx, bookUpdates, handlers.OnOrderBook)
	return nil
}

func (s *Service) Stop() {
	s.lifecycle.Lock()
	defer s.lifecycle.Unlock()
	s.stopLocked()
}

func (s *Service) stopLocked() {
	if s.cancel == nil {
		return
	}
	s.cancel()
	s.cancel = nil
	s.wg.Wait()
}

func (s *Service) runStream(
	ctx context.Context,
	health *sessionHealth,
	streamName string,
	run func() error,
) {
	defer s.wg.Done()

	if err := run(); err != nil && ctx.Err() == nil {
		health.update(streamName, ConnectionState{
			State:   "error",
			Message: err.Error(),
		})
	}
}

func (s *Service) dispatchOrderBook(
	ctx context.Context,
	updates <-chan OrderBookSnapshot,
	onSnapshot func(OrderBookSnapshot),
) {
	defer s.wg.Done()
	if onSnapshot == nil {
		<-ctx.Done()
		return
	}

	for {
		select {
		case <-ctx.Done():
			return
		case snapshot := <-updates:
			onSnapshot(snapshot)
		}
	}
}

func offerLatest(updates chan OrderBookSnapshot, snapshot OrderBookSnapshot) {
	select {
	case updates <- snapshot:
		return
	default:
	}

	select {
	case <-updates:
	default:
	}

	select {
	case updates <- snapshot:
	default:
	}
}

func (s *Service) provider(name string) (Provider, error) {
	provider, ok := s.providers[strings.ToLower(strings.TrimSpace(name))]
	if !ok {
		return nil, fmt.Errorf("market-data provider %q is not registered", name)
	}
	return provider, nil
}

type sessionHealth struct {
	mu             sync.Mutex
	subscription   Subscription
	onStatus       func(StreamStatus)
	candleState    string
	orderBookState string
}

func newSessionHealth(
	subscription Subscription,
	onStatus func(StreamStatus),
) *sessionHealth {
	health := &sessionHealth{
		subscription:   subscription,
		onStatus:       onStatus,
		candleState:    "connecting",
		orderBookState: "connecting",
	}
	health.emitLocked("connecting", "")
	return health
}

func (h *sessionHealth) update(streamName string, state ConnectionState) {
	h.mu.Lock()
	defer h.mu.Unlock()

	switch streamName {
	case streamCandles:
		h.candleState = state.State
	case streamOrderBook:
		h.orderBookState = state.State
	}

	overall := "connecting"
	switch {
	case h.candleState == "error" || h.orderBookState == "error":
		overall = "error"
	case h.candleState == "reconnecting" || h.orderBookState == "reconnecting":
		overall = "reconnecting"
	case h.candleState == "connected" && h.orderBookState == "connected":
		overall = "connected"
	}

	h.emitLocked(overall, state.Message)
}

func (h *sessionHealth) emitLocked(state string, message string) {
	if h.onStatus == nil {
		return
	}
	h.onStatus(StreamStatus{
		Provider:       h.subscription.Provider,
		Market:         h.subscription.Market,
		Symbol:         h.subscription.Symbol,
		State:          state,
		CandleState:    h.candleState,
		OrderBookState: h.orderBookState,
		Message:        message,
	})
}
