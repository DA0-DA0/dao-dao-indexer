#!/bin/bash

# This script is used to rotate the trace file, since it grows very fast. It:
# 1. Stops the node
# 2. Waits for exporer to finish processing the trace file
# 3. Renames the trace file to trace.out.<1-3>, where 1-3 is the number of the
#    last trace file. If there are already 3 trace files, the last one is
#    deleted.
# 4. Starts the node

DAEMON_HOME=$1
SERVICE=$2

if [ -z "$DAEMON_HOME" ] || [ -z "$SERVICE" ]
then
    echo "Syntax: $0 <daemon home> <service>"
    exit 1
fi

TRACE_FILE=$DAEMON_HOME/indexer/trace.out

echo "Stopping $SERVICE..."
systemctl stop $SERVICE

# wait 10 seconds for the exporter to finish reading
sleep 10

echo "Waiting for trace reading to complete..."
while [ -f $TRACE_FILE.reading ]
do
    sleep 1
done

echo "Stopping exporter..."
sudo -u indexer pm2 stop all

echo "Rotating trace file..."
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

echo "Starting $SERVICE..."
systemctl start $SERVICE

# wait 10 seconds for the node to start
sleep 10

echo "Starting exporter..."
sudo -u indexer pm2 start all

echo "Done!"
