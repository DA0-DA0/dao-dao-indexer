package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"cosmossdk.io/log"
	"cosmossdk.io/store/metrics"
	"cosmossdk.io/store/rootmulti"
	"cosmossdk.io/store/types"
	dbm "github.com/cosmos/cosmos-db"

	"github.com/cosmos/btcutil/bech32"
)

type (
	Metadata struct {
		BlockHeight int64  `json:"blockHeight"`
		TxHash      string `json:"txHash"`
		// Snake case matches `storeNameCtxKey` in `store/cachemulti/store.go` in
		// the Cosmos SDK.
		StoreName string `json:"store_name"`
	}

	// traceOperation implements a traced KVStore operation
	TraceOperation struct {
		Operation string   `json:"operation"`
		Key       string   `json:"key"`
		Value     string   `json:"value"`
		Metadata  Metadata `json:"metadata"`
	}
)

var (
	BalancesPrefix      = []byte{0x02}
	ContractKeyPrefix   = []byte{0x02}
	ContractStorePrefix = []byte{0x03}
)

func main() {
	args := os.Args
	if len(args) < 4 {
		fmt.Println("Usage: dump <home_dir> <output> <store_name> [address]")
		os.Exit(1)
	}

	home_dir := args[1]
	output := args[2]
	storeName := args[3]

	var addressBech32Data []byte
	if len(args) > 4 {
		_, bech32Data, err := bech32.DecodeToBase256(args[4])
		if err != nil {
			panic(err)
		}
		addressBech32Data = bech32Data
	}

	out, err := os.OpenFile(output, os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		panic(err)
	}
	defer out.Close()

	dataDir := filepath.Join(home_dir, "data")
	db, err := dbm.NewDB("application", dbm.GoLevelDBBackend, dataDir)
	if err != nil {
		panic(err)
	}
	defer db.Close()

	latestHeight := rootmulti.GetLatestVersion(db)
	fmt.Printf("Latest height: %d\n", latestHeight)

	storeKey := types.NewKVStoreKey(storeName)
	ms := rootmulti.NewStore(db, log.NewNopLogger(), metrics.NewNoOpMetrics())
	ms.MountStoreWithDB(storeKey, types.StoreTypeIAVL, nil)

	err = ms.LoadLatestVersion()
	if err != nil {
		panic(err)
	}

	store := ms.GetCommitKVStore(storeKey)
	if store == nil {
		panic("Store is nil")
	}

	iter := store.Iterator(nil, nil)

	// Dump all keys as write operations.
	count := 0
	for ; iter.Valid(); iter.Next() {
		key := iter.Key()
		// Only write contract keys.
		if key[0] != ContractKeyPrefix[0] && key[0] != ContractStorePrefix[0] {
			continue
		}

		// Make sure key is for the given address.
		if len(addressBech32Data) > 0 {
			if !bytes.HasPrefix(key[1:], addressBech32Data) {
				continue
			}
		}

		value := iter.Value()
		trace := TraceOperation{
			Operation: "write",
			Key:       base64.StdEncoding.EncodeToString(key),
			Value:     base64.StdEncoding.EncodeToString(value),
			Metadata: Metadata{
				BlockHeight: latestHeight,
				TxHash:      "",
				StoreName:   storeName,
			},
		}

		raw, err := json.Marshal(trace)
		if err != nil {
			panic(err)
		}

		if _, err := out.Write(raw); err != nil {
			panic(err)
		}

		if _, err := out.WriteString("\n"); err != nil {
			panic(err)
		}

		count++
		if count%5000 == 0 {
			fmt.Println("Exported", count, "keys")
		}
	}

	fmt.Println("Exported", count, "keys")
}
