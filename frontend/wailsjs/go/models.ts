export namespace marketdata {
	
	export class Candle {
	    provider: string;
	    market: string;
	    symbol: string;
	    interval: string;
	    time: number;
	    closeTime: number;
	    open: number;
	    high: number;
	    low: number;
	    close: number;
	    volume: number;
	    quoteVolume: number;
	    closed: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Candle(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.provider = source["provider"];
	        this.market = source["market"];
	        this.symbol = source["symbol"];
	        this.interval = source["interval"];
	        this.time = source["time"];
	        this.closeTime = source["closeTime"];
	        this.open = source["open"];
	        this.high = source["high"];
	        this.low = source["low"];
	        this.close = source["close"];
	        this.volume = source["volume"];
	        this.quoteVolume = source["quoteVolume"];
	        this.closed = source["closed"];
	    }
	}
	export class MarketPair {
	    provider: string;
	    market: string;
	    symbol: string;
	    baseAsset: string;
	    quoteAsset: string;
	    status: string;
	    pricePrecision: number;
	    quantityPrecision: number;
	    lastPrice: number;
	    priceChange: number;
	    priceChangePercent: number;
	    weightedAveragePrice: number;
	    openPrice: number;
	    highPrice: number;
	    lowPrice: number;
	    volume: number;
	    quoteVolume: number;
	    tradeCount: number;
	
	    static createFrom(source: any = {}) {
	        return new MarketPair(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.provider = source["provider"];
	        this.market = source["market"];
	        this.symbol = source["symbol"];
	        this.baseAsset = source["baseAsset"];
	        this.quoteAsset = source["quoteAsset"];
	        this.status = source["status"];
	        this.pricePrecision = source["pricePrecision"];
	        this.quantityPrecision = source["quantityPrecision"];
	        this.lastPrice = source["lastPrice"];
	        this.priceChange = source["priceChange"];
	        this.priceChangePercent = source["priceChangePercent"];
	        this.weightedAveragePrice = source["weightedAveragePrice"];
	        this.openPrice = source["openPrice"];
	        this.highPrice = source["highPrice"];
	        this.lowPrice = source["lowPrice"];
	        this.volume = source["volume"];
	        this.quoteVolume = source["quoteVolume"];
	        this.tradeCount = source["tradeCount"];
	    }
	}
	export class MarketCatalog {
	    provider: string;
	    market: string;
	    quoteAsset?: string;
	    items: MarketPair[];
	    loadedAt: number;
	    expiresAt: number;
	    cached: boolean;
	    stale: boolean;
	    warning?: string;
	
	    static createFrom(source: any = {}) {
	        return new MarketCatalog(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.provider = source["provider"];
	        this.market = source["market"];
	        this.quoteAsset = source["quoteAsset"];
	        this.items = this.convertValues(source["items"], MarketPair);
	        this.loadedAt = source["loadedAt"];
	        this.expiresAt = source["expiresAt"];
	        this.cached = source["cached"];
	        this.stale = source["stale"];
	        this.warning = source["warning"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class Symbol {
	    provider: string;
	    market: string;
	    symbol: string;
	    baseAsset: string;
	    quoteAsset: string;
	    status: string;
	    pricePrecision: number;
	    quantityPrecision: number;
	
	    static createFrom(source: any = {}) {
	        return new Symbol(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.provider = source["provider"];
	        this.market = source["market"];
	        this.symbol = source["symbol"];
	        this.baseAsset = source["baseAsset"];
	        this.quoteAsset = source["quoteAsset"];
	        this.status = source["status"];
	        this.pricePrecision = source["pricePrecision"];
	        this.quantityPrecision = source["quantityPrecision"];
	    }
	}

}

