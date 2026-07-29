package binance

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"crypto-trader-vue/internal/marketdata"
)

const catalogCacheTTL = time.Hour

type catalogCacheEntry struct {
	loadedAt  time.Time
	expiresAt time.Time
	items     []marketdata.MarketPair
}

type catalogFlight struct {
	done chan struct{}
}

type ticker24h struct {
	Symbol               string       `json:"symbol"`
	LastPrice            float64Value `json:"lastPrice"`
	PriceChange          float64Value `json:"priceChange"`
	PriceChangePercent   float64Value `json:"priceChangePercent"`
	WeightedAveragePrice float64Value `json:"weightedAvgPrice"`
	OpenPrice            float64Value `json:"openPrice"`
	HighPrice            float64Value `json:"highPrice"`
	LowPrice             float64Value `json:"lowPrice"`
	Volume               float64Value `json:"volume"`
	QuoteVolume          float64Value `json:"quoteVolume"`
	TradeCount           int64Value   `json:"count"`
}

func (c *Client) Catalog(
	ctx context.Context,
	market marketdata.Market,
	quoteAsset string,
	forceRefresh bool,
) (marketdata.MarketCatalog, error) {
	normalizedQuote := strings.ToUpper(strings.TrimSpace(quoteAsset))
	entry, cached, stale, warning, err := c.catalogEntry(
		ctx,
		market,
		forceRefresh,
	)
	if err != nil {
		return marketdata.MarketCatalog{}, err
	}

	items := make([]marketdata.MarketPair, 0, len(entry.items))
	for _, item := range entry.items {
		if normalizedQuote == "" || item.QuoteAsset == normalizedQuote {
			items = append(items, item)
		}
	}

	return marketdata.MarketCatalog{
		Provider:   providerName,
		Market:     market,
		QuoteAsset: normalizedQuote,
		Items:      items,
		LoadedAt:   entry.loadedAt.UnixMilli(),
		ExpiresAt:  entry.expiresAt.UnixMilli(),
		Cached:     cached,
		Stale:      stale,
		Warning:    warning,
	}, nil
}

func (c *Client) Symbols(
	ctx context.Context,
	market marketdata.Market,
	quoteAsset string,
) ([]marketdata.Symbol, error) {
	normalizedQuote := strings.ToUpper(strings.TrimSpace(quoteAsset))
	if normalizedQuote == "" {
		normalizedQuote = "USDT"
	}

	catalog, err := c.Catalog(ctx, market, normalizedQuote, false)
	if err != nil {
		return nil, err
	}

	symbols := make([]marketdata.Symbol, 0, len(catalog.Items))
	for _, item := range catalog.Items {
		symbols = append(symbols, marketdata.Symbol{
			Provider:          item.Provider,
			Market:            item.Market,
			Symbol:            item.Symbol,
			BaseAsset:         item.BaseAsset,
			QuoteAsset:        item.QuoteAsset,
			Status:            item.Status,
			PricePrecision:    item.PricePrecision,
			QuantityPrecision: item.QuantityPrecision,
		})
	}
	return symbols, nil
}

func (c *Client) catalogEntry(
	ctx context.Context,
	market marketdata.Market,
	forceRefresh bool,
) (catalogCacheEntry, bool, bool, string, error) {
	for {
		c.catalogMu.Lock()
		entry, hasEntry := c.catalogs[market]
		if !forceRefresh && hasEntry && time.Now().Before(entry.expiresAt) {
			c.catalogMu.Unlock()
			return cloneCatalogEntry(entry), true, false, "", nil
		}

		if flight, inFlight := c.catalogFlights[market]; inFlight {
			done := flight.done
			c.catalogMu.Unlock()
			select {
			case <-ctx.Done():
				return catalogCacheEntry{}, false, false, "", ctx.Err()
			case <-done:
				forceRefresh = false
				continue
			}
		}

		flight := &catalogFlight{done: make(chan struct{})}
		c.catalogFlights[market] = flight
		c.catalogMu.Unlock()

		items, err := c.fetchCatalog(ctx, market)
		now := time.Now()

		c.catalogMu.Lock()
		if err == nil {
			entry = catalogCacheEntry{
				loadedAt:  now,
				expiresAt: now.Add(catalogCacheTTL),
				items:     items,
			}
			c.catalogs[market] = entry
			hasEntry = true
		}
		delete(c.catalogFlights, market)
		close(flight.done)
		c.catalogMu.Unlock()

		if err == nil {
			return cloneCatalogEntry(entry), false, false, "", nil
		}
		if hasEntry {
			return cloneCatalogEntry(entry), true, true, err.Error(), nil
		}
		return catalogCacheEntry{}, false, false, "", err
	}
}

func (c *Client) fetchCatalog(
	ctx context.Context,
	market marketdata.Market,
) ([]marketdata.MarketPair, error) {
	var (
		symbols     []marketdata.Symbol
		tickers     map[string]ticker24h
		symbolsErr  error
		tickersErr  error
		waitForREST sync.WaitGroup
	)

	waitForREST.Add(2)
	go func() {
		defer waitForREST.Done()
		symbols, symbolsErr = c.fetchSymbols(ctx, market)
	}()
	go func() {
		defer waitForREST.Done()
		tickers, tickersErr = c.fetchTickers(ctx, market)
	}()
	waitForREST.Wait()

	if symbolsErr != nil {
		return nil, symbolsErr
	}
	if tickersErr != nil {
		return nil, tickersErr
	}
	return mergeCatalog(symbols, tickers), nil
}

func (c *Client) fetchTickers(
	ctx context.Context,
	market marketdata.Market,
) (map[string]ticker24h, error) {
	target, err := endpointsFor(market)
	if err != nil {
		return nil, err
	}

	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		target.rest+"/ticker/24hr",
		nil,
	)
	if err != nil {
		return nil, fmt.Errorf("create binance ticker request: %w", err)
	}

	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("request binance 24h tickers: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf(
			"binance 24h tickers returned HTTP %d",
			response.StatusCode,
		)
	}

	var payload []ticker24h
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decode binance 24h tickers: %w", err)
	}

	tickers := make(map[string]ticker24h, len(payload))
	for _, ticker := range payload {
		tickers[ticker.Symbol] = ticker
	}
	return tickers, nil
}

func mergeCatalog(
	symbols []marketdata.Symbol,
	tickers map[string]ticker24h,
) []marketdata.MarketPair {
	items := make([]marketdata.MarketPair, 0, len(symbols))
	for _, symbol := range symbols {
		ticker := tickers[symbol.Symbol]
		items = append(items, marketdata.MarketPair{
			Provider:             symbol.Provider,
			Market:               symbol.Market,
			Symbol:               symbol.Symbol,
			BaseAsset:            symbol.BaseAsset,
			QuoteAsset:           symbol.QuoteAsset,
			Status:               symbol.Status,
			PricePrecision:       symbol.PricePrecision,
			QuantityPrecision:    symbol.QuantityPrecision,
			LastPrice:            float64(ticker.LastPrice),
			PriceChange:          float64(ticker.PriceChange),
			PriceChangePercent:   float64(ticker.PriceChangePercent),
			WeightedAveragePrice: float64(ticker.WeightedAveragePrice),
			OpenPrice:            float64(ticker.OpenPrice),
			HighPrice:            float64(ticker.HighPrice),
			LowPrice:             float64(ticker.LowPrice),
			Volume:               float64(ticker.Volume),
			QuoteVolume:          float64(ticker.QuoteVolume),
			TradeCount:           int64(ticker.TradeCount),
		})
	}

	sort.Slice(items, func(left, right int) bool {
		return items[left].Symbol < items[right].Symbol
	})
	return items
}

func cloneCatalogEntry(entry catalogCacheEntry) catalogCacheEntry {
	return catalogCacheEntry{
		loadedAt:  entry.loadedAt,
		expiresAt: entry.expiresAt,
		items:     append([]marketdata.MarketPair(nil), entry.items...),
	}
}
