#!/bin/bash

# This script is used to rotate the trace file, since it grows very fast. It:
# 1. Stops the node
# 2. Waits for exporer to finish processing the trace file
# 3. Renames the trace file to trace.out.<1-3>, where 1-3 is the number of the
#    last trace file. If there are already 3 trace files, the last one is
#    deleted.
# 4. Starts the node

if [ -z "$DAEMON_HOME" ]
then
    echo "DAEMON_HOME is not set"
    exit 1
fi

if [ -z "$SERVICE" ]
then
    echo "SERVICE is not set"
    exit 1
fi

TRACE_FILE=$DAEMON_HOME/indexer/trace.out

systemctl stop $SERVICE

while [ -f $TRACE_FILE.reading ]
do
    sleep 1
done

pm2 stop all

if [ -f $TRACE_FILE.3 ]
then
    rm $TRACE_FILE.3
fi

if [ -f $TRACE_FILE.2 ]
then
    mv $TRACE_FILE.2 $TRACE_FILE.3
fi

if [ -f $TRACE_FILE.1 ]
then
    mv $TRACE_FILE.1 $TRACE_FILE.2
fi

if [ -f $TRACE_FILE ]
then
    mv $TRACE_FILE $TRACE_FILE.1
fi

systemctl start $SERVICE
