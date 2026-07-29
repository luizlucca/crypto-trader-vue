package binance

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"crypto-trader-vue/internal/marketdata"
)

const symbolCacheTTL = 5 * time.Minute

type symbolCacheEntry struct {
	expiresAt time.Time
	symbols   []marketdata.Symbol
}

type exchangeInfoResponse struct {
	Symbols []exchangeSymbol `json:"symbols"`
}

type exchangeSymbol struct {
	Symbol            string           `json:"symbol"`
	Status            string           `json:"status"`
	BaseAsset         string           `json:"baseAsset"`
	QuoteAsset        string           `json:"quoteAsset"`
	ContractType      string           `json:"contractType"`
	PricePrecision    int              `json:"pricePrecision"`
	QuantityPrecision int              `json:"quantityPrecision"`
	Filters           []exchangeFilter `json:"filters"`
}

type exchangeFilter struct {
	FilterType string `json:"filterType"`
	TickSize   string `json:"tickSize"`
	StepSize   string `json:"stepSize"`
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

	symbols, ok := c.cachedSymbols(market)
	if !ok {
		var err error
		symbols, err = c.fetchSymbols(ctx, market)
		if err != nil {
			return nil, err
		}
		c.storeSymbols(market, symbols)
	}

	filtered := make([]marketdata.Symbol, 0, len(symbols))
	for _, symbol := range symbols {
		if symbol.QuoteAsset == normalizedQuote {
			filtered = append(filtered, symbol)
		}
	}
	return filtered, nil
}

func (c *Client) fetchSymbols(
	ctx context.Context,
	market marketdata.Market,
) ([]marketdata.Symbol, error) {
	target, err := endpointsFor(market)
	if err != nil {
		return nil, err
	}

	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		target.rest+"/exchangeInfo",
		nil,
	)
	if err != nil {
		return nil, fmt.Errorf("create binance exchange-info request: %w", err)
	}

	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("request binance exchange info: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("binance exchange info returned HTTP %d", response.StatusCode)
	}

	var payload exchangeInfoResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decode binance exchange info: %w", err)
	}

	symbols := make([]marketdata.Symbol, 0, len(payload.Symbols))
	for _, item := range payload.Symbols {
		if item.Status != "TRADING" {
			continue
		}
		if market == marketdata.MarketFutures && item.ContractType != "PERPETUAL" {
			continue
		}

		pricePrecision := item.PricePrecision
		quantityPrecision := item.QuantityPrecision
		for _, filter := range item.Filters {
			switch filter.FilterType {
			case "PRICE_FILTER":
				if precision := precisionFromIncrement(filter.TickSize); precision >= 0 {
					pricePrecision = precision
				}
			case "LOT_SIZE":
				if precision := precisionFromIncrement(filter.StepSize); precision >= 0 {
					quantityPrecision = precision
				}
			}
		}

		symbols = append(symbols, marketdata.Symbol{
			Provider:          providerName,
			Market:            market,
			Symbol:            item.Symbol,
			BaseAsset:         item.BaseAsset,
			QuoteAsset:        item.QuoteAsset,
			Status:            item.Status,
			PricePrecision:    pricePrecision,
			QuantityPrecision: quantityPrecision,
		})
	}

	sort.Slice(symbols, func(left, right int) bool {
		return symbols[left].Symbol < symbols[right].Symbol
	})
	return symbols, nil
}

func (c *Client) cachedSymbols(market marketdata.Market) ([]marketdata.Symbol, bool) {
	c.symbolMu.RLock()
	defer c.symbolMu.RUnlock()

	entry, ok := c.symbols[market]
	if !ok || time.Now().After(entry.expiresAt) {
		return nil, false
	}
	return entry.symbols, true
}

func (c *Client) storeSymbols(market marketdata.Market, symbols []marketdata.Symbol) {
	c.symbolMu.Lock()
	defer c.symbolMu.Unlock()

	c.symbols[market] = symbolCacheEntry{
		expiresAt: time.Now().Add(symbolCacheTTL),
		symbols:   symbols,
	}
}

func precisionFromIncrement(increment string) int {
	normalized := strings.TrimRight(strings.TrimSpace(increment), "0")
	dot := strings.IndexByte(normalized, '.')
	if dot < 0 {
		return 0
	}
	return len(normalized) - dot - 1
}
