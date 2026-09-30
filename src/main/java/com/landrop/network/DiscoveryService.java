package com.landrop.network;

import com.landrop.core.Device;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.*;
import java.util.stream.Collectors;

public class DiscoveryService {

    private static final Logger log = LoggerFactory.getLogger(DiscoveryService.class);

    private static final int DISCOVERY_PORT = 8888;
    private static final String PING_PREFIX = "LANDROP_PING:";
    private static final String BROADCAST_ADDRESS = "255.255.255.255";
    private static final int BROADCAST_INTERVAL_MS = 2_000;
    private static final int STALE_THRESHOLD_MS = 10_000;
    private static final int RECEIVE_BUFFER_SIZE = 1024;

    private final ConcurrentHashMap<String, Device> activeDevices = new ConcurrentHashMap<>();
    private final ExecutorService executor = Executors.newFixedThreadPool(3);
    private final ScheduledExecutorService staleCleanupScheduler = Executors.newSingleThreadScheduledExecutor();

    private volatile DatagramSocket socket;
    private volatile boolean running = false;
    private String ownIpAddress;

    public void start(String myDeviceName) {
        if (running) {
            log.warn("DiscoveryService is already running.");
            return;
        }
        try {
            socket = new DatagramSocket(DISCOVERY_PORT);
            socket.setBroadcast(true);
            ownIpAddress = InetAddress.getLocalHost().getHostAddress();
            running = true;

            log.info("DiscoveryService started. Own IP: [{}], Device name: [{}]", ownIpAddress, myDeviceName);

            executor.submit(() -> startBroadcasting(myDeviceName));
            executor.submit(this::listenForDevices);

            staleCleanupScheduler.scheduleAtFixedRate(
                    this::removeStaleDevices,
                    STALE_THRESHOLD_MS,
                    STALE_THRESHOLD_MS,
                    TimeUnit.MILLISECONDS
            );

        } catch (IOException e) {
            log.error("Failed to initialize DiscoveryService socket on port {}: {}", DISCOVERY_PORT, e.getMessage(), e);
            stop();
        }
    }

    public void stop() {
        running = false;
        staleCleanupScheduler.shutdownNow();
        executor.shutdownNow();
        if (socket != null && !socket.isClosed()) {
            socket.close();
        }
        log.info("DiscoveryService stopped.");
    }

    public List<Device> getActiveDevices() {
        return List.copyOf(activeDevices.values());
    }

    private void startBroadcasting(String myDeviceName) {
        String message = PING_PREFIX + myDeviceName;
        byte[] payload = message.getBytes(StandardCharsets.UTF_8);

        try {
            InetAddress broadcastAddr = InetAddress.getByName(BROADCAST_ADDRESS);
            while (running) {
                try {
                    DatagramPacket packet = new DatagramPacket(payload, payload.length, broadcastAddr, DISCOVERY_PORT);
                    socket.send(packet);
                    log.debug("Broadcast sent: [{}]", message);
                    Thread.sleep(BROADCAST_INTERVAL_MS);
                } catch (IOException e) {
                    if (running) {
                        log.warn("Error sending broadcast packet: {}", e.getMessage());
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    log.info("Broadcasting thread interrupted.");
                    break;
                }
            }
        } catch (UnknownHostException e) {
            log.error("Invalid broadcast address [{}]: {}", BROADCAST_ADDRESS, e.getMessage(), e);
        }
    }

    private void listenForDevices() {
        byte[] buffer = new byte[RECEIVE_BUFFER_SIZE];
        while (running) {
            try {
                DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                socket.receive(packet);

                String senderIp = packet.getAddress().getHostAddress();
                String message = new String(packet.getData(), 0, packet.getLength(), StandardCharsets.UTF_8);

                if (senderIp.equals(ownIpAddress)) {
                    continue;
                }

                if (!message.startsWith(PING_PREFIX)) {
                    log.debug("Ignored unrecognized packet from [{}]: [{}]", senderIp, message);
                    continue;
                }

                String deviceName = message.substring(PING_PREFIX.length()).trim();
                Device device = new Device(senderIp, deviceName, System.currentTimeMillis());
                activeDevices.put(senderIp, device);
                log.info("Discovered device: name=[{}], ip=[{}]", deviceName, senderIp);

            } catch (IOException e) {
                if (running) {
                    log.warn("Error receiving UDP packet: {}", e.getMessage());
                }
            }
        }
    }

    private void removeStaleDevices() {
        long cutoff = System.currentTimeMillis() - STALE_THRESHOLD_MS;
        activeDevices.entrySet().removeIf(entry -> {
            boolean isStale = entry.getValue().lastSeenTimestamp() < cutoff;
            if (isStale) {
                log.info("Removing stale device: ip=[{}], name=[{}]", entry.getKey(), entry.getValue().deviceName());
            }
            return isStale;
        });
    }
}
