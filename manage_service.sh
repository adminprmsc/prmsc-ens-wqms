#!/bin/bash
# Management script for WQMS service

SERVICE_FILE="wqms.service"
SERVICE_NAME="wqms"
SYSTEMD_PATH="/etc/systemd/system/$SERVICE_NAME.service"

case "$1" in
    install)
        echo "Installing WQMS systemd service..."
        sudo cp $SERVICE_FILE $SYSTEMD_PATH
        sudo systemctl daemon-reload
        sudo systemctl enable $SERVICE_NAME
        echo "Service installed and enabled!"
        echo "Use './manage_service.sh start' to start the service"
        ;;
    
    start)
        echo "Starting WQMS service..."
        sudo systemctl start $SERVICE_NAME
        sudo systemctl status $SERVICE_NAME
        ;;
    
    stop)
        echo "Stopping WQMS service..."
        sudo systemctl stop $SERVICE_NAME
        ;;
    
    restart)
        echo "Restarting WQMS service..."
        sudo systemctl restart $SERVICE_NAME
        sudo systemctl status $SERVICE_NAME
        ;;
    
    status)
        sudo systemctl status $SERVICE_NAME
        ;;
    
    logs)
        sudo journalctl -u $SERVICE_NAME -f
        ;;
    
    uninstall)
        echo "Uninstalling WQMS service..."
        sudo systemctl stop $SERVICE_NAME
        sudo systemctl disable $SERVICE_NAME
        sudo rm $SYSTEMD_PATH
        sudo systemctl daemon-reload
        echo "Service uninstalled!"
        ;;
    
    *)
        echo "Usage: $0 {install|start|stop|restart|status|logs|uninstall}"
        echo ""
        echo "Commands:"
        echo "  install   - Install and enable the systemd service"
        echo "  start     - Start the service"
        echo "  stop      - Stop the service"
        echo "  restart   - Restart the service"
        echo "  status    - Check service status"
        echo "  logs      - View service logs (real-time)"
        echo "  uninstall - Remove the systemd service"
        exit 1
        ;;
esac

