package marketdata

import "testing"

func TestParseMarket(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		input   string
		want    Market
		wantErr bool
	}{
		{name: "spot", input: "SPOT", want: MarketSpot},
		{name: "futures", input: " futures ", want: MarketFutures},
		{name: "invalid", input: "margin", wantErr: true},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			got, err := ParseMarket(test.input)
			if test.wantErr {
				if err == nil {
					t.Fatal("expected an error")
				}
				return
			}
			if err != nil {
				t.Fatalf("ParseMarket returned an error: %v", err)
			}
			if got != test.want {
				t.Fatalf("ParseMarket = %q, want %q", got, test.want)
			}
		})
	}
}
