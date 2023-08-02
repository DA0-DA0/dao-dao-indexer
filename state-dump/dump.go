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
)

type (
	Metadata struct {
		BlockHeight int64  `json:"blockHeight"`
		TxHash      string `json:"txHash"`
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
	ContractKeyPrefix   = []byte{0x02}
	ContractStorePrefix = []byte{0x03}
)

func main() {
	args := os.Args
	if len(args) < 3 {
		fmt.Println("Usage: dump <home_dir> <output> [address]")
		os.Exit(1)
	}

	home_dir := args[1]
	output := args[2]

	var address string
	if len(args) > 3 {
		address = args[3]
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

	wasmKey := types.NewKVStoreKey("wasm")
	ms := rootmulti.NewStore(db, log.NewNopLogger(), metrics.NewNoOpMetrics())
	ms.MountStoreWithDB(wasmKey, types.StoreTypeIAVL, nil)

	err = ms.LoadLatestVersion()
	if err != nil {
		panic(err)
	}

	store := ms.GetCommitKVStore(wasmKey)
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
		if len(address) > 0 {
			addressBytes := []byte(address)
			keyWithoutTypeByte := key[1:]
			if !bytes.HasPrefix(keyWithoutTypeByte, addressBytes) {
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
