package fr.alykell.aloria.hud;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import javax.xml.bind.DatatypeConverter;

/** Packs de ressources faits par Aloria (1.8.9), écrits en zip dans resourcepacks/ quand on les coche. */
public final class AloriaPacks {
	/** Image 64×64 entièrement transparente */
	private static final byte[] CLEAR = DatatypeConverter.parseBase64Binary(
		"iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAJ0lEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAIB3A0BAAAGveg7oAAAAAElFTkSuQmCC");

	private AloriaPacks() {
	}

	/** Sans particules d'explosion : en 1.8.9, une seule image pour toute l'animation de l'explosion */
	public static void writeNoExplosion(File zip) throws IOException {
		try (ZipOutputStream z = new ZipOutputStream(new FileOutputStream(zip))) {
			entry(z, "pack.mcmeta", "{\"pack\":{\"pack_format\":1,\"description\":\"Aloria : sans particules d'explosion\"}}"
				.getBytes(StandardCharsets.UTF_8));
			entry(z, "assets/minecraft/textures/entity/explosion.png", CLEAR);
		}
	}

	private static void entry(ZipOutputStream z, String name, byte[] data) throws IOException {
		z.putNextEntry(new ZipEntry(name));
		z.write(data);
		z.closeEntry();
	}
}
