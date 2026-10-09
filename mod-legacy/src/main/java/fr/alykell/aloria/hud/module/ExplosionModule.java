package fr.alykell.aloria.hud.module;

import fr.alykell.aloria.hud.Draw;
import fr.alykell.aloria.hud.G;
import fr.alykell.aloria.hud.Tr;
import fr.alykell.aloria.hud.config.ModuleSettings;
import fr.alykell.aloria.hud.mixin.CameraAccessor;
import fr.alykell.aloria.hud.mixin.CreeperAccessor;
import net.minecraft.block.Blocks;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.util.Window;
import net.minecraft.entity.Entity;
import net.minecraft.entity.TntEntity;
import net.minecraft.entity.mob.CreeperEntity;
import net.minecraft.entity.vehicle.TntMinecartEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import org.lwjgl.util.glu.GLU;

import java.nio.FloatBuffer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/**
 * Temps restant avant l'explosion, au-dessus de chaque TNT, wagonnet de TNT et creeper qui gonfle.
 * Compté au tick près (un tick = 50 ms) et lissé entre deux ticks.
 */
public final class ExplosionModule extends HudModule {
	private static final class Fuse {
		final Entity entity;
		final ItemStack icon;
		final float seconds;
		final boolean armed;
		final double distance;

		Fuse(Entity entity, ItemStack icon, float seconds, boolean armed, double distance) {
			this.entity = entity;
			this.icon = icon;
			this.seconds = seconds;
			this.armed = armed;
			this.distance = distance;
		}
	}

	private static final int PAD = 3;
	private static final int ICON = 16;
	private static final double RANGE = 48;
	/** Gris d'un creeper qui dégonfle */
	private static final int DISARMED = 0xFF8FB3C4;

	public ExplosionModule() {
		super("explosions");
	}

	@Override
	public ModuleSettings defaults() {
		return new ModuleSettings(false, 0f, 0f);
	}

	@Override
	public boolean placeable() {
		return false;
	}

	@Override
	public String hint() {
		return Tr.tr("hint.explosions");
	}

	/** Secondes avant l'explosion (lissées entre deux ticks), ou négatif si l'entité ne va pas exploser */
	public static float secondsLeft(Entity entity, float partialTick) {
		if (entity instanceof TntEntity) return (((TntEntity) entity).fuseTimer - partialTick) / 20f;
		if (entity instanceof TntMinecartEntity && ((TntMinecartEntity) entity).isPrimed()) {
			return (((TntMinecartEntity) entity).getFuseTicks() - partialTick) / 20f;
		}
		if (entity instanceof CreeperEntity) {
			// On suit le gonflement lui-même, pas son sens : il peut basculer d'un tick à l'autre
			CreeperEntity creeper = (CreeperEntity) entity;
			CreeperAccessor c = (CreeperAccessor) creeper;
			if (c.getCurrentFuseTime() == 0 && creeper.getFuseSpeed() <= 0) return -1;
			float swell = c.getLastFuseTime() + (c.getCurrentFuseTime() - c.getLastFuseTime()) * partialTick;
			return Math.max(0, c.getFuseTime() - swell) / 20f;
		}
		return -1;
	}

	private static boolean armed(Entity entity) {
		return !(entity instanceof CreeperEntity) || ((CreeperEntity) entity).getFuseSpeed() > 0;
	}

	private static ItemStack icon(Entity entity) {
		if (entity instanceof TntEntity) return new ItemStack(Item.fromBlock(Blocks.TNT));
		if (entity instanceof TntMinecartEntity) return new ItemStack(Items.MINECART_WITH_TNT);
		if (entity instanceof CreeperEntity) return new ItemStack(Items.SKULL, 1, 4);
		return null;
	}

	private static String label(float seconds) {
		return String.format(Locale.ROOT, "%.2f s", Math.max(0, seconds));
	}

	/** Rouge à moins d'une seconde, jaune à moins de deux, gris si le creeper dégonfle */
	private static int color(ModuleSettings s, float seconds, boolean armed) {
		if (!armed) return DISARMED;
		if (seconds <= 1) return 0xFFFF6B6B;
		if (seconds <= 2) return 0xFFFFD166;
		return Draw.textColor(s);
	}

	private static int labelWidth(G g, String text, boolean icon) {
		return PAD * 2 + (icon ? ICON + 3 : 0) + g.textWidth(text);
	}

	private static void drawLabel(G g, ModuleSettings s, ItemStack icon, float seconds, boolean armed) {
		String text = label(seconds);
		int w = labelWidth(g, text, icon != null);
		int h = ICON + PAD * 2;
		Draw.panel(g, 0, 0, w, h, s);
		int x = PAD;
		if (icon != null) {
			g.item(icon, x, PAD);
			x += ICON + 3;
		}
		g.text(text, x, (h - 8) / 2, color(s, seconds, armed), s.shadow);
	}

	// ---------------------------------------------------------------- aperçu dans le menu

	@Override
	public int width(MinecraftClient mc, G g, ModuleSettings s, boolean preview) {
		return labelWidth(g, label(3.25f), true);
	}

	@Override
	public int height(MinecraftClient mc, G g, ModuleSettings s, boolean preview) {
		return ICON + PAD * 2;
	}

	@Override
	public void draw(G g, MinecraftClient mc, ModuleSettings s, boolean preview) {
		drawLabel(g, s, new ItemStack(Item.fromBlock(Blocks.TNT)), 3.25f, true);
	}

	// ---------------------------------------------------------------- en jeu

	@Override
	public void drawOverlay(G g, MinecraftClient mc, ModuleSettings s, float partialTick) {
		Entity camera = mc.getCameraEntity();
		if (mc.world == null || camera == null) return;
		// Position de la caméra (pieds de l'entité, interpolée) : la matrice de vue inclut la hauteur des yeux
		double cx = camera.prevX + (camera.x - camera.prevX) * partialTick;
		double cy = camera.prevY + (camera.y - camera.prevY) * partialTick;
		double cz = camera.prevZ + (camera.z - camera.prevZ) * partialTick;

		List<Fuse> fuses = new ArrayList<>();
		for (Entity entity : mc.world.loadedEntities) {
			ItemStack icon = icon(entity);
			if (icon == null) continue;
			float seconds = secondsLeft(entity, partialTick);
			double distance = Math.sqrt(entity.squaredDistanceTo(camera.x, camera.y, camera.z));
			if (seconds >= 0 && distance <= RANGE) fuses.add(new Fuse(entity, icon, seconds, armed(entity), distance));
		}
		if (fuses.isEmpty()) return;
		// Les plus proches par-dessus
		Collections.sort(fuses, (a, b) -> Double.compare(b.distance, a.distance));

		int scale = new Window(mc).getScaleFactor();
		FloatBuffer out = org.lwjgl.BufferUtils.createFloatBuffer(3);
		for (Fuse fuse : fuses) {
			Entity e = fuse.entity;
			float x = (float) (e.prevX + (e.x - e.prevX) * partialTick - cx);
			float y = (float) (e.prevY + (e.y - e.prevY) * partialTick + e.height + 0.5 - cy);
			float z = (float) (e.prevZ + (e.z - e.prevZ) * partialTick - cz);
			out.clear();
			if (!GLU.gluProject(x, y, z, CameraAccessor.getModelMatrix(), CameraAccessor.getProjectionMatrix(), CameraAccessor.getViewport(), out)) continue;
			// Profondeur hors de [0, 1] : derrière la caméra
			if (out.get(2) < 0 || out.get(2) > 1) continue;
			float sx = out.get(0) / scale;
			float sy = (mc.height - out.get(1)) / scale;
			if (sx < -50 || sx > g.guiWidth() + 50 || sy < -30 || sy > g.guiHeight() + 30) continue;

			int w = labelWidth(g, label(fuse.seconds), true);
			int h = ICON + PAD * 2;
			g.push();
			g.translate(sx, sy);
			g.scale(s.scale);
			g.translate(-w / 2f, -h);
			drawLabel(g, s, fuse.icon, fuse.seconds, fuse.armed);
			g.pop();
		}
	}
}
