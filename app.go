package main

import (
	"context"

	"crypto-trader-vue/internal/marketdata"
	"crypto-trader-vue/internal/providers/binance"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	eventCandle    = "market:candle"
	eventOrderBook = "market:orderbook"
	eventStatus    = "market:status"
)

type App struct {
	ctx        context.Context
	marketData *marketdata.Service
}

func NewApp() *App {
	return &App{
		marketData: marketdata.NewService(binance.New()),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) shutdown(_ context.Context) {
	a.marketData.Stop()
}

func (a *App) GetSymbols(
	provider string,
	marketValue string,
	quoteAsset string,
) ([]marketdata.Symbol, error) {
	market, err := marketdata.ParseMarket(marketValue)
	if err != nil {
		return nil, err
	}
	return a.marketData.Symbols(a.ctx, provider, market, quoteAsset)
}

func (a *App) GetMarketCatalog(
	provider string,
	marketValue string,
	quoteAsset string,
	forceRefresh bool,
) (marketdata.MarketCatalog, error) {
	market, err := marketdata.ParseMarket(marketValue)
	if err != nil {
		return marketdata.MarketCatalog{}, err
	}
	return a.marketData.Catalog(
		a.ctx,
		provider,
		market,
		quoteAsset,
		forceRefresh,
	)
}

func (a *App) GetCandles(
	provider string,
	marketValue string,
	symbol string,
	interval string,
	limit int,
) ([]marketdata.Candle, error) {
	market, err := marketdata.ParseMarket(marketValue)
	if err != nil {
		return nil, err
	}
	return a.marketData.Candles(
		a.ctx,
		provider,
		market,
		symbol,
		interval,
		limit,
	)
}

func (a *App) StartMarketStream(
	provider string,
	marketValue string,
	symbol string,
	interval string,
) error {
	market, err := marketdata.ParseMarket(marketValue)
	if err != nil {
		return err
	}

	subscription := marketdata.Subscription{
		Provider: provider,
		Market:   market,
		Symbol:   symbol,
		Interval: interval,
	}

	return a.marketData.Start(a.ctx, subscription, marketdata.StreamHandlers{
		OnCandle: func(candle marketdata.Candle) {
			runtime.EventsEmit(a.ctx, eventCandle, candle)
		},
		OnOrderBook: func(snapshot marketdata.OrderBookSnapshot) {
			runtime.EventsEmit(a.ctx, eventOrderBook, snapshot)
		},
		OnStatus: func(status marketdata.StreamStatus) {
			runtime.LogInfof(
				a.ctx,
				"market session %s/%s %s: state=%s candles=%s orderbook=%s %s",
				status.Provider,
				status.Market,
				status.Symbol,
				status.State,
				status.CandleState,
				status.OrderBookState,
				status.Message,
			)
			runtime.EventsEmit(a.ctx, eventStatus, status)
		},
	})
}

func (a *App) StopMarketStream() {
	a.marketData.Stop()
}
