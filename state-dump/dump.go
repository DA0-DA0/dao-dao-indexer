package main

import (
	"fmt"
	"os"
	"path/filepath"

	"cosmossdk.io/log"
	"cosmossdk.io/store/metrics"
	"cosmossdk.io/store/rootmulti"
	"cosmossdk.io/store/types"
	dbm "github.com/cosmos/cosmos-db"
)

func main() {
	args := os.Args
	if len(args) != 3 {
		fmt.Println("Usage: dump <backend_type> <home_dir>")
		os.Exit(1)
	}

	dataDir := filepath.Join(args[2], "data")
	db, err := dbm.NewDB("application", dbm.BackendType(args[1]), dataDir)
	if err != nil {
		fmt.Println(err)
		os.Exit(1)
	}

	ms := rootmulti.NewStore(db, log.NewNopLogger(), metrics.NewNoOpMetrics())
	store := ms.GetKVStore(types.NewKVStoreKey("wasm"))

	iter := store.Iterator(nil, nil)

	for ; iter.Valid(); iter.Next() {
		fmt.Printf("%s: %s\n", iter.Key(), iter.Value())
	}
}
