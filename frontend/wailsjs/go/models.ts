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

