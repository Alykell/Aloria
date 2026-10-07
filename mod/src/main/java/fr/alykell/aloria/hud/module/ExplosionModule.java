package fr.alykell.aloria.hud.module;

import fr.alykell.aloria.hud.Draw;
import fr.alykell.aloria.hud.Fonts;
import fr.alykell.aloria.hud.config.ModuleSettings;
import fr.alykell.aloria.hud.mixin.CreeperAccessor;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.item.PrimedTnt;
import net.minecraft.world.entity.monster.Creeper;
import net.minecraft.world.entity.vehicle.minecart.MinecartTNT;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;
import org.joml.Vector4f;
import org.jspecify.annotations.Nullable;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * Temps restant avant l'explosion, au-dessus de chaque TNT, wagonnet de TNT et creeper qui gonfle.
 * Compté au tick près (un tick = 50 ms) et lissé entre deux ticks.
 */
public final class ExplosionModule extends HudModule {
	/** armed : faux pour un creeper qui dégonfle (il n'explosera que s'il se remet à gonfler) */
	private record Fuse(Entity entity, Item icon, float seconds, boolean armed, double distance) {
	}

	/** Gris d'un creeper qui dégonfle */
	private static final int DISARMED = 0xFF8FB3C4;

	private static final int PAD = 3;
	private static final int ICON = 16;
	private static final double RANGE = 48;

	public ExplosionModule() {
		super("explosions", "Chrono d'explosion");
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
		return "Affiché au-dessus des TNT et des creepers";
	}

	/**
	 * Secondes avant l'explosion, lissées entre deux ticks pour que le compteur défile au lieu de sauter
	 * de 50 ms en 50 ms ; négatif si l'entité ne va pas exploser.
	 */
	public static float secondsLeft(Entity entity, float partialTick) {
		if (entity instanceof PrimedTnt tnt) return (tnt.getFuse() - partialTick) / 20f;
		if (entity instanceof MinecartTNT cart && cart.isPrimed()) return (cart.getFuse() - partialTick) / 20f;
		if (entity instanceof Creeper creeper) {
			// Le serveur décide à chaque tick si le creeper gonfle ou dégonfle (cible à portée et en vue) :
			// ce sens peut basculer d'un tick à l'autre, alors on suit le gonflement lui-même, pas le sens
			CreeperAccessor c = (CreeperAccessor) creeper;
			if (c.getSwell() == 0 && creeper.getSwellDir() <= 0) return -1;
			float swell = creeper.getSwelling(partialTick) * (c.getMaxSwell() - 2);
			return Math.max(0, c.getMaxSwell() - swell) / 20f;
		}
		return -1;
	}

	private static boolean armed(Entity entity) {
		return !(entity instanceof Creeper creeper) || creeper.getSwellDir() > 0;
	}

	private static @Nullable Item icon(Entity entity) {
		if (entity instanceof PrimedTnt) return Items.TNT;
		if (entity instanceof MinecartTNT) return Items.TNT_MINECART;
		if (entity instanceof Creeper) return Items.CREEPER_HEAD;
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

	private static int labelWidth(Minecraft mc, ModuleSettings s, String text, boolean icon) {
		return PAD * 2 + (icon ? ICON + 3 : 0) + Fonts.width(mc, s.font, text);
	}

	/** Étiquette dessinée en (0, 0) */
	private static void drawLabel(GuiGraphicsExtractor g, Minecraft mc, ModuleSettings s, @Nullable Item icon, float seconds, boolean armed) {
		String text = label(seconds);
		int w = labelWidth(mc, s, text, icon != null);
		int h = ICON + PAD * 2;
		Draw.panel(g, 0, 0, w, h, s);
		int x = PAD;
		if (icon != null) {
			g.item(new ItemStack(icon), x, PAD);
			x += ICON + 3;
		}
		Fonts.draw(g, mc, s.font, text, x, (h - 8) / 2, color(s, seconds, armed), s.shadow);
	}

	// ---------------------------------------------------------------- aperçu dans le menu

	@Override
	public int width(Minecraft mc, ModuleSettings s, boolean preview) {
		return labelWidth(mc, s, label(3.25f), mc.level != null);
	}

	@Override
	public int height(Minecraft mc, ModuleSettings s, boolean preview) {
		return ICON + PAD * 2;
	}

	@Override
	public void draw(GuiGraphicsExtractor g, Minecraft mc, ModuleSettings s, boolean preview) {
		// Pas d'objet sans partie chargée (composants non liés)
		drawLabel(g, mc, s, mc.level != null ? Items.TNT : null, 3.25f, true);
	}

	// ---------------------------------------------------------------- en jeu

	@Override
	public void drawOverlay(GuiGraphicsExtractor g, Minecraft mc, ModuleSettings s, float partialTick) {
		if (mc.level == null) return;
		Camera camera = mc.gameRenderer.mainCamera();
		Vec3 eye = camera.position();

		List<Fuse> fuses = new ArrayList<>();
		for (Entity entity : mc.level.entitiesForRendering()) {
			Item icon = icon(entity);
			if (icon == null) continue;
			float seconds = secondsLeft(entity, partialTick);
			double distance = entity.position().distanceTo(eye);
			if (seconds >= 0 && distance <= RANGE) fuses.add(new Fuse(entity, icon, seconds, armed(entity), distance));
		}
		if (fuses.isEmpty()) return;
		// Les plus proches par-dessus
		fuses.sort(Comparator.comparingDouble(Fuse::distance).reversed());

		Matrix4f projection = camera.getViewRotationProjectionMatrix(new Matrix4f());
		for (Fuse fuse : fuses) {
			Vec3 pos = fuse.entity().getPosition(partialTick).add(0, fuse.entity().getBbHeight() + 0.5, 0);
			Vector4f clip = projection.transform(new Vector4f((float) (pos.x - eye.x), (float) (pos.y - eye.y), (float) (pos.z - eye.z), 1f));
			// Derrière la caméra
			if (clip.w <= 0.05f) continue;
			float sx = (clip.x / clip.w * 0.5f + 0.5f) * g.guiWidth();
			float sy = (0.5f - clip.y / clip.w * 0.5f) * g.guiHeight();
			if (sx < -50 || sx > g.guiWidth() + 50 || sy < -30 || sy > g.guiHeight() + 30) continue;

			int w = labelWidth(mc, s, label(fuse.seconds()), true);
			int h = ICON + PAD * 2;
			g.pose().pushMatrix();
			g.pose().translate(sx, sy);
			g.pose().scale(s.scale, s.scale);
			g.pose().translate(-w / 2f, -h);
			drawLabel(g, mc, s, fuse.icon(), fuse.seconds(), fuse.armed());
			g.pose().popMatrix();
		}
	}
}
