package binance

import (
	"fmt"

	"crypto-trader-vue/internal/marketdata"
)

type endpoints struct {
	rest     string
	wsPublic string
	wsMarket string
}

func endpointsFor(market marketdata.Market) (endpoints, error) {
	switch market {
	case marketdata.MarketSpot:
		return endpoints{
			rest:     "https://api.binance.com/api/v3",
			wsPublic: "wss://stream.binance.com:9443/ws",
			wsMarket: "wss://stream.binance.com:9443/ws",
		}, nil
	case marketdata.MarketFutures:
		return endpoints{
			rest:     "https://fapi.binance.com/fapi/v1",
			wsPublic: "wss://fstream.binance.com/public/ws",
			wsMarket: "wss://fstream.binance.com/market/ws",
		}, nil
	default:
		return endpoints{}, fmt.Errorf("binance does not support market %q", market)
	}
}
