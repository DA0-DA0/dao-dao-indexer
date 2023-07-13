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

	latestHeight := rootmulti.GetLatestVersion(db)
	fmt.Printf("Latest height: %d\n", latestHeight)

	wasmKey := types.NewKVStoreKey("wasm")
	ms := rootmulti.NewStore(db, log.NewNopLogger(), metrics.NewNoOpMetrics())
	ms.MountStoreWithDB(wasmKey, types.StoreTypeIAVL, db)

	err = ms.LoadLatestVersion()
	if err != nil {
		fmt.Println(err)
		os.Exit(1)
	}

	store := ms.GetCommitKVStore(wasmKey)
	if store == nil {
		fmt.Println("Store is nil")
		os.Exit(1)
	}

	iter := store.Iterator(nil, nil)

	for ; iter.Valid(); iter.Next() {
		fmt.Printf("%s: %s\n", iter.Key(), iter.Value())
	}
}
