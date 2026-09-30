package com.landrop;

import com.landrop.network.DiscoveryService;
import io.javalin.Javalin;
import io.javalin.http.UploadedFile;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import io.javalin.http.staticfiles.Location;

import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

public class Main {
    private static final Logger log = LoggerFactory.getLogger(Main.class);
    private static final Map<String, FileData> fileStorage = new ConcurrentHashMap<>();

    record FileData(byte[] content, String filename, String contentType) {}

    public static void main(String[] args) {
        DiscoveryService discoveryService = new DiscoveryService();
        discoveryService.start("Monster_Tulpar");

        Javalin app = Javalin.create(config -> {
            config.bundledPlugins.enableCors(cors -> {
                cors.addRule(it -> it.anyHost());
            });
            for (int i = 0; i < args.length; i++) {
                if (args[i].equals("--static") && i + 1 < args.length) {
                    config.staticFiles.add(args[i+1], Location.EXTERNAL);
                    log.info("Serving static files from: {}", args[i+1]);
                }
            }
        }).start(8080);
        
        app.events(events -> {
            events.serverStopping(() -> discoveryService.stop());
        });

        app.get("/api/ping", ctx -> ctx.result("LAN-Drop API is running"));
        
        app.get("/api/devices", ctx -> ctx.json(discoveryService.getActiveDevices()));
        
        app.post("/api/upload", ctx -> {
            List<UploadedFile> files = ctx.uploadedFiles("files");
            if (files.isEmpty()) {
                ctx.status(400).result("No files uploaded");
                return;
            }
            
            String pin = String.format("%06d", new Random().nextInt(1000000));
            
            if (files.size() == 1) {
                UploadedFile file = files.get(0);
                fileStorage.put(pin, new FileData(file.content().readAllBytes(), file.filename(), file.contentType()));
            } else {
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                try (ZipOutputStream zos = new ZipOutputStream(baos)) {
                    for (UploadedFile file : files) {
                        ZipEntry entry = new ZipEntry(file.filename());
                        zos.putNextEntry(entry);
                        zos.write(file.content().readAllBytes());
                        zos.closeEntry();
                    }
                }
                fileStorage.put(pin, new FileData(baos.toByteArray(), "landrop_files.zip", "application/zip"));
            }
            
            log.info("Stored file(s) with PIN: {}", pin);
            ctx.json(Map.of("pin", pin));
        });

        app.get("/api/download/{pin}", ctx -> {
            String pin = ctx.pathParam("pin");
            FileData data = fileStorage.get(pin);
            if (data == null) {
                ctx.status(404).result("Invalid PIN or file expired");
                return;
            }
            
            ctx.header("Content-Disposition", "attachment; filename=\"" + data.filename() + "\"");
            ctx.contentType(data.contentType());
            ctx.result(data.content());
        });

        log.info("LAN-Drop Web Server started on port 8080. Awaiting local IP discovery...");
    }
}
