package binance

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"crypto-trader-vue/internal/marketdata"

	"github.com/gorilla/websocket"
)

const providerName = "binance"

type Client struct {
	httpClient     *http.Client
	dialer         *websocket.Dialer
	catalogMu      sync.Mutex
	catalogs       map[marketdata.Market]catalogCacheEntry
	catalogFlights map[marketdata.Market]*catalogFlight
}

func New() *Client {
	return &Client{
		httpClient: &http.Client{Timeout: 12 * time.Second},
		dialer: &websocket.Dialer{
			HandshakeTimeout: 10 * time.Second,
		},
		catalogs:       make(map[marketdata.Market]catalogCacheEntry),
		catalogFlights: make(map[marketdata.Market]*catalogFlight),
	}
}

func (c *Client) Name() string {
	return providerName
}

func (c *Client) Candles(
	ctx context.Context,
	market marketdata.Market,
	symbol string,
	interval string,
	limit int,
) ([]marketdata.Candle, error) {
	normalizedSymbol, err := validateSymbol(symbol)
	if err != nil {
		return nil, err
	}
	if err := validateInterval(interval); err != nil {
		return nil, err
	}
	if limit < 1 || limit > 1000 {
		return nil, fmt.Errorf("candle limit must be between 1 and 1000")
	}

	target, err := endpointsFor(market)
	if err != nil {
		return nil, err
	}

	query := url.Values{}
	query.Set("symbol", normalizedSymbol)
	query.Set("interval", interval)
	query.Set("limit", strconv.Itoa(limit))

	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		target.rest+"/klines?"+query.Encode(),
		nil,
	)
	if err != nil {
		return nil, fmt.Errorf("create binance candles request: %w", err)
	}

	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("request binance candles: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("binance candles returned HTTP %d", response.StatusCode)
	}

	var rows [][]json.RawMessage
	if err := json.NewDecoder(response.Body).Decode(&rows); err != nil {
		return nil, fmt.Errorf("decode binance candles: %w", err)
	}

	candles := make([]marketdata.Candle, 0, len(rows))
	for _, row := range rows {
		candle, err := parseCandleRow(row, market, normalizedSymbol, interval)
		if err != nil {
			return nil, err
		}
		candles = append(candles, candle)
	}
	return candles, nil
}

func validateSymbol(symbol string) (string, error) {
	normalized := strings.ToUpper(strings.TrimSpace(symbol))
	if len(normalized) < 5 || len(normalized) > 20 {
		return "", fmt.Errorf("invalid symbol %q", symbol)
	}
	for _, char := range normalized {
		if (char < 'A' || char > 'Z') && (char < '0' || char > '9') {
			return "", fmt.Errorf("invalid symbol %q", symbol)
		}
	}
	return normalized, nil
}

func validateInterval(interval string) error {
	switch interval {
	case "1s", "1m", "3m", "5m", "15m", "30m",
		"1h", "2h", "4h", "6h", "8h", "12h",
		"1d", "3d", "1w", "1M":
		return nil
	default:
		return fmt.Errorf("unsupported candle interval %q", interval)
	}
}
