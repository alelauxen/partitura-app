package io.github.alelauxen.partitura;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioPlaybackCaptureConfiguration;
import android.media.AudioRecord;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import java.io.File;
import java.io.FileOutputStream;
import java.io.RandomAccessFile;

// Captura o som que está saindo do celular (YouTube, Spotify...) usando o recurso
// oficial do Android 10+ (AudioPlaybackCapture). Grava um WAV mono 22 050 Hz.
public class CaptureService extends Service {
    static final String ACTION_STOP = "stop";
    static final String CH = "captura";
    static volatile boolean running = false;
    static final int SR = 22050;

    volatile boolean stopFlag = false;
    MediaProjection proj;
    Thread worker;

    @Override
    public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopFlag = true;
            if (!running) stopSelf();
            return START_NOT_STICKY;
        }
        if (running || intent == null) return START_NOT_STICKY;

        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CH, "Captura de áudio", NotificationManager.IMPORTANCE_LOW));
        startForeground(1, note("Ouvindo o som do celular…", 0), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);

        int code = intent.getIntExtra("code", 0);
        Intent data = intent.getParcelableExtra("data");
        final int max = intent.getIntExtra("max", 0);
        try {
            MediaProjectionManager m = getSystemService(MediaProjectionManager.class);
            proj = m.getMediaProjection(code, data);
            proj.registerCallback(new MediaProjection.Callback() {
                @Override
                public void onStop() { stopFlag = true; }
            }, new Handler(Looper.getMainLooper()));
        } catch (Exception e) {
            fail("Não consegui iniciar a captura: " + e.getMessage());
            return START_NOT_STICKY;
        }

        AudioPlaybackCaptureConfiguration cfg = new AudioPlaybackCaptureConfiguration.Builder(proj)
                .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                .addMatchingUsage(AudioAttributes.USAGE_GAME)
                .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                .build();
        AudioFormat fmt = new AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(SR)
                .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                .build();
        final AudioRecord rec;
        try {
            int bs = Math.max(AudioRecord.getMinBufferSize(SR, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT), SR) * 2;
            rec = new AudioRecord.Builder().setAudioFormat(fmt).setBufferSizeInBytes(bs).setAudioPlaybackCaptureConfig(cfg).build();
            rec.startRecording();
        } catch (SecurityException e) {
            fail("Sem permissão de áudio.");
            return START_NOT_STICKY;
        } catch (Exception e) {
            fail("Não consegui iniciar a captura: " + e.getMessage());
            return START_NOT_STICKY;
        }

        running = true;
        stopFlag = false;
        final String name = "cap-" + System.currentTimeMillis() + ".wav";
        final File dir = new File(getCacheDir(), "cap");
        dir.mkdirs();
        File[] old = dir.listFiles();
        if (old != null) for (File f : old) f.delete();
        final File out = new File(dir, name);

        worker = new Thread(() -> {
            long samples = 0, loud = 0;
            int lastSec = -1;
            short[] buf = new short[SR / 10];
            byte[] bytes = new byte[buf.length * 2];
            try (FileOutputStream fo = new FileOutputStream(out)) {
                fo.write(new byte[44]);
                while (!stopFlag) {
                    int n = rec.read(buf, 0, buf.length);
                    if (n <= 0) continue;
                    for (int i = 0; i < n; i++) {
                        short v = buf[i];
                        bytes[2 * i] = (byte) (v & 0xff);
                        bytes[2 * i + 1] = (byte) ((v >> 8) & 0xff);
                        if (v > 300 || v < -300) loud++;
                    }
                    fo.write(bytes, 0, n * 2);
                    samples += n;
                    int sec = (int) (samples / SR);
                    if (sec != lastSec) {
                        lastSec = sec;
                        String hint = (sec >= 4 && loud == 0) ? "Ainda não chegou som. Dê play no vídeo (alguns apps não deixam capturar)." : null;
                        MainActivity.state("rec", sec, hint);
                        getSystemService(NotificationManager.class).notify(1, note("Ouvindo o som do celular… " + sec / 60 + ":" + String.format("%02d", sec % 60), sec));
                    }
                    if (max > 0 && sec >= max) break;
                }
            } catch (Exception e) {
                finish(null, "Erro ao gravar: " + e.getMessage(), rec);
                return;
            }
            try { writeHeader(out, samples); } catch (Exception e) { }
            if (samples < SR) finish(null, "A captura foi muito curta.", rec);
            else if (loud < SR / 20) finish(null, "Não chegou som nenhum. Confira se o vídeo estava tocando; alguns apps não permitem que o som seja capturado.", rec);
            else finish(name, null, rec);
        });
        worker.start();
        return START_NOT_STICKY;
    }

    void finish(String name, String err, AudioRecord rec) {
        try { rec.stop(); } catch (Exception e) { }
        try { rec.release(); } catch (Exception e) { }
        try { if (proj != null) proj.stop(); } catch (Exception e) { }
        running = false;
        MainActivity.state("done", 0, null);
        MainActivity.captureDone(name, err);
        NotificationManager nm = getSystemService(NotificationManager.class);
        stopForeground(STOP_FOREGROUND_REMOVE);
        // avisa e traz o app de volta
        Notification.Builder b = new Notification.Builder(this, CH)
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentTitle(err == null ? "Áudio capturado ✓" : "Captura não deu certo")
                .setContentText(err == null ? "Toque para voltar ao app." : err)
                .setContentIntent(openApp())
                .setAutoCancel(true);
        nm.notify(2, b.build());
        try {
            Intent i = new Intent(this, MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            startActivity(i);
        } catch (Exception e) { }
        stopSelf();
    }

    void fail(String err) {
        running = false;
        MainActivity.state("done", 0, null);
        MainActivity.captureDone(null, err);
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    PendingIntent openApp() {
        Intent i = new Intent(this, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        return PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    Notification note(String text, int sec) {
        Intent stop = new Intent(this, CaptureService.class);
        stop.setAction(ACTION_STOP);
        PendingIntent ps = PendingIntent.getService(this, 1, stop, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this, CH)
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentTitle("Do Áudio à Partitura")
                .setContentText(text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(openApp())
                .addAction(new Notification.Action.Builder(null, "■ Parar", ps).build())
                .build();
    }

    static void writeHeader(File f, long samples) throws Exception {
        long dataLen = samples * 2;
        try (RandomAccessFile r = new RandomAccessFile(f, "rw")) {
            r.seek(0);
            r.writeBytes("RIFF");
            r.write(le32(36 + dataLen));
            r.writeBytes("WAVEfmt ");
            r.write(le32(16));
            r.write(le16(1));
            r.write(le16(1));
            r.write(le32(SR));
            r.write(le32(SR * 2));
            r.write(le16(2));
            r.write(le16(16));
            r.writeBytes("data");
            r.write(le32(dataLen));
        }
    }

    static byte[] le32(long v) { return new byte[]{(byte) v, (byte) (v >> 8), (byte) (v >> 16), (byte) (v >> 24)}; }
    static byte[] le16(int v) { return new byte[]{(byte) v, (byte) (v >> 8)}; }
}
