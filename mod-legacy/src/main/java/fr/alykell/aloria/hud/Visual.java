package fr.alykell.aloria.hud;

import com.mojang.blaze3d.platform.GlStateManager;
import fr.alykell.aloria.hud.config.VisualSettings;
import fr.alykell.aloria.hud.config.VisualSettings.HandTransform;
import net.minecraft.client.MinecraftClient;
import net.minecraft.entity.Entity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.effect.StatusEffect;

/**
 * Effets de l'écran Visuel en 1.8.9, appliqués par les mixins : main tenue, luminosité max et brouillard.
 * Mêmes réglages que le mod moderne (même fichier) ; la 1.8.9 n'a ni seconde main, ni bouclier, ni totem, ni neige poudreuse.
 */
public final class Visual {
	/** Point d'ancrage de l'objet tenu (position du jeu de base) : la taille change autour de ce point */
	private static final float ANCHOR_X = 0.56f;
	private static final float ANCHOR_Y = -0.52f;
	private static final float ANCHOR_Z = -0.72f;
	/** Luminosité utilisée pour « voir comme en plein jour » : bien au-delà du maximum des options (100 %) */
	private static final float FULLBRIGHT_GAMMA = 100f;

	private Visual() {
	}

	public static VisualSettings settings() {
		return AloriaHud.config().visual();
	}

	// ---------------------------------------------------------------- main tenue

	/** Appelé juste après la mise en place du dessin de la main (et de l'objet tenu) en vue à la première personne */
	public static void transformHand() {
		HandTransform t = settings().mainHand;
		if (t.isNeutral()) return;
		// Bras droit (le seul en 1.8.9) : « vers l'extérieur » = vers la droite
		GlStateManager.translate(t.side + ANCHOR_X, t.height + ANCHOR_Y, -t.depth + ANCHOR_Z);
		GlStateManager.scale(t.scale, t.scale, t.scale);
		GlStateManager.translate(-ANCHOR_X, -ANCHOR_Y, -ANCHOR_Z);
	}

	// ---------------------------------------------------------------- luminosité

	/** Luminosité lue par le jeu pour calculer l'éclairage : très au-dessus du maximum avec « luminosité max » */
	public static float gamma(float gamma) {
		return settings().fullbright ? FULLBRIGHT_GAMMA : gamma;
	}

	// ---------------------------------------------------------------- brouillard

	/** Cécité : effet de jeu, pas du décor, jamais touché */
	private static boolean blind(Entity camera) {
		return camera instanceof LivingEntity && ((LivingEntity) camera).hasStatusEffect(StatusEffect.BLINDNESS);
	}

	/** Brouillard de l'air (début ou fin) selon la dimension, éloigné selon le réglage (100 = jeu normal, 0 = aucun) */
	public static float linearFog(float value, float viewDistance) {
		MinecraftClient mc = MinecraftClient.getInstance();
		if (mc.world == null || blind(mc.getCameraEntity())) return value;
		VisualSettings v = settings();
		String dimension = mc.world.dimension.getName();
		int strength = "Nether".equals(dimension) ? v.fogNether : "The End".equals(dimension) ? v.fogEnd : v.fogOverworld;
		return farther(value, strength, viewDistance);
	}

	/**
	 * Brouillard des liquides (densité du brouillard exponentiel du jeu : 2 dans la lave, 0,1 dans l'eau) : la visibilité
	 * (inverse de la densité) est éloignée selon le réglage, 0 % = plus de brouillard
	 */
	public static float densityFog(float density, float viewDistance) {
		MinecraftClient mc = MinecraftClient.getInstance();
		if (mc.world == null || density <= 0 || blind(mc.getCameraEntity())) return density;
		VisualSettings v = settings();
		int strength = Math.max(0, Math.min(100, density >= 1f ? v.fogLava : v.fogWater));
		if (strength >= 100) return density;
		if (strength == 0) return 0f;
		return 1f / farther(1f / density, strength, viewDistance);
	}

	/**
	 * Distance éloignée selon le réglage, en progression géométrique (comme le mod moderne) : la lave (1 bloc de
	 * visibilité) et l'air (des dizaines) réagissent pareil au curseur. Le jeu dessine jusqu'à la distance d'affichage.
	 */
	private static float farther(float value, int strength, float viewDistance) {
		strength = Math.max(0, Math.min(100, strength));
		if (strength >= 100) return value;
		if (strength == 0) return Float.MAX_VALUE / 4;
		float t = 1 - strength / 100f;
		float from = Math.max(0.5f, value);
		float target = Math.max(from, viewDistance * 2);
		return (float) (from * Math.pow(target / from, t));
	}
}
