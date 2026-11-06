package fr.alykell.aloria.hud;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** Packs de ressources faits par Aloria, écrits en zip dans resourcepacks/ quand on les coche. */
public final class AloriaPacks {
	/** Image 16×16 entièrement transparente */
	private static final byte[] CLEAR = Base64.getDecoder().decode(
		"iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAEklEQVR42mNgGAWjYBSMAggAAAQQAAGvRYgsAAAAAElFTkSuQmCC");

	/**
	 * Formats acceptés : pack_format 15 pour la 1.20.1, supported_formats jusqu'à la 1.21.8,
	 * min_format/max_format depuis la 1.21.9 (26.x compris).
	 */
	private static final String MCMETA = "{\"pack\":{\"description\":\"%s\",\"pack_format\":15,"
		+ "\"supported_formats\":[15,999],\"min_format\":15,\"max_format\":999}}";

	private AloriaPacks() {
	}

	/** Sans particules d'explosion : les 16 images de l'explosion (TNT, cristal de l'End, boule de feu) deviennent transparentes */
	public static void writeNoExplosion(Path zip) throws IOException {
		try (OutputStream out = Files.newOutputStream(zip); ZipOutputStream z = new ZipOutputStream(out)) {
			entry(z, "pack.mcmeta", String.format(MCMETA, "Aloria : sans particules d'explosion").getBytes(StandardCharsets.UTF_8));
			for (int i = 0; i < 16; i++) entry(z, "assets/minecraft/textures/particle/explosion_" + i + ".png", CLEAR);
		}
	}

	private static void entry(ZipOutputStream z, String name, byte[] data) throws IOException {
		z.putNextEntry(new ZipEntry(name));
		z.write(data);
		z.closeEntry();
	}
}
