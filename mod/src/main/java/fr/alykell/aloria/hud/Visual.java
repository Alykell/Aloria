package fr.alykell.aloria.hud;

import com.mojang.blaze3d.vertex.PoseStack;
import fr.alykell.aloria.hud.config.VisualSettings;
import fr.alykell.aloria.hud.config.VisualSettings.HandTransform;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
//#if MC >= 12106
import net.minecraft.client.renderer.fog.FogData;
//#endif
import net.minecraft.world.InteractionHand;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.HumanoidArm;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.material.FogType;
import net.minecraft.util.Mth;
import org.jspecify.annotations.Nullable;

/** Effets de l'écran Visuel, appliqués par les mixins (mains, totem, luminosité, brouillard). */
public final class Visual {
	/** Point d'ancrage d'un objet tenu (position du jeu de base) : la taille change autour de ce point */
	private static final float ANCHOR_X = 0.56f;
	private static final float ANCHOR_Y = -0.52f;
	private static final float ANCHOR_Z = -0.72f;

	private Visual() {
	}

	public static VisualSettings settings() {
		return AloriaHud.config().visual();
	}

	// ---------------------------------------------------------------- mains et bouclier

	/** Réglages qui s'appliquent à cet objet : ceux du bouclier pour un bouclier, sinon ceux de la main */
	public static HandTransform transformFor(InteractionHand hand, ItemStack stack) {
		VisualSettings v = settings();
		if (stack.is(Items.SHIELD)) return v.shield;
		return hand == InteractionHand.MAIN_HAND ? v.mainHand : v.offHand;
	}

	/** Appelé juste avant le dessin d'une main (et de l'objet qu'elle tient) en vue à la première personne */
	public static void transformHand(PoseStack pose, InteractionHand hand, ItemStack stack) {
		HandTransform t = transformFor(hand, stack);
		if (t.isNeutral()) return;
		Minecraft mc = Minecraft.getInstance();
		HumanoidArm mainArm = mc.player != null ? mc.player.getMainArm() : HumanoidArm.RIGHT;
		HumanoidArm arm = hand == InteractionHand.MAIN_HAND ? mainArm : mainArm.getOpposite();
		// « Vers l'extérieur » : vers la droite pour le bras droit, vers la gauche pour le gauche
		int outward = arm == HumanoidArm.RIGHT ? 1 : -1;
		float ax = outward * ANCHOR_X;
		pose.translate(outward * t.side + ax, t.height + ANCHOR_Y, -t.depth + ANCHOR_Z);
		pose.scale(t.scale, t.scale, t.scale);
		pose.translate(-ax, -ANCHOR_Y, -ANCHOR_Z);
	}

	// ---------------------------------------------------------------- totem

	public static void scaleTotem(PoseStack pose) {
		float scale = settings().totemScale;
		if (scale != 1f) pose.scale(scale, scale, scale);
	}

	/** Rejoue l'animation du totem pour voir sa taille (sur le joueur en 26.3, sur le rendu du jeu en 26.2) */
	public static void previewTotem() {
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null) return;
		ItemStack totem = new ItemStack(Items.TOTEM_OF_UNDYING);
		for (Object target : new Object[] {mc.player, mc.gameRenderer}) {
			try {
				target.getClass().getMethod("displayItemActivation", ItemStack.class).invoke(target, totem);
				return;
			} catch (ReflectiveOperationException ignored) {
				// Méthode absente dans cette version : on essaie l'autre
			}
		}
	}

	// ---------------------------------------------------------------- brouillard

	/** Pourcentage de brouillard voulu à l'endroit où se trouve la caméra (100 = jeu normal) */
	public static int fogStrength(Camera camera, ClientLevel level) {
		VisualSettings v = settings();
		return switch (camera.getFluidInCamera()) {
			case LAVA -> v.fogLava;
			case WATER -> v.fogWater;
			case POWDER_SNOW -> v.fogSnow;
			default -> {
				if (level.dimension() == Level.NETHER) yield v.fogNether;
				if (level.dimension() == Level.END) yield v.fogEnd;
				yield v.fogOverworld;
			}
		};
	}

	/** Caméra dans un liquide ou de la neige poudreuse (sinon : brouillard de l'air) */
	public static boolean inFluid(Camera camera) {
		FogType type = camera.getFluidInCamera();
		//#if MC >= 12106
		return type != FogType.NONE && type != FogType.ATMOSPHERIC;
		//#else
		//$$ return type != FogType.NONE;
		//#endif
	}

	/**
	 * Distances de brouillard {début, fin} éloignées selon le réglage (0 % = plus du tout), ou null pour garder
	 * celles du jeu. Cécité et Obscurité ne sont jamais touchées : ce sont des effets de jeu, pas du décor.
	 */
	public static float @Nullable [] adjustedFog(Camera camera, ClientLevel level, float start, float end, float renderDistanceBlocks) {
		int strength = Mth.clamp(fogStrength(camera, level), 0, 100);
		if (strength >= 100) return null;
		if (camera.entity() instanceof LivingEntity living
			&& (living.hasEffect(MobEffects.BLINDNESS) || living.hasEffect(MobEffects.DARKNESS))) return null;
		if (strength == 0) return new float[] {Float.MAX_VALUE, Float.MAX_VALUE};
		float t = 1 - strength / 100f;
		// Progression géométrique : la lave (1 bloc de visibilité) et le Nether (une centaine) réagissent pareil au curseur
		float from = Math.max(0.5f, end);
		float target = Math.max(from, renderDistanceBlocks * 2);
		float newEnd = (float) (from * Math.pow(target / from, t));
		return new float[] {start + (newEnd * 0.6f - start) * t, newEnd};
	}

	//#if MC >= 12106
	/** 1.21.6 et plus : brouillard du décor, et dans un liquide celui du ciel et des nuages */
	public static void applyFog(FogData fog, Camera camera, ClientLevel level, float renderDistanceBlocks) {
		float[] adjusted = adjustedFog(camera, level, fog.environmentalStart, fog.environmentalEnd, renderDistanceBlocks);
		if (adjusted == null) return;
		fog.environmentalStart = adjusted[0];
		fog.environmentalEnd = adjusted[1];
		// Dans un liquide, le ciel et les nuages sont aussi cachés par le brouillard : on les rend avec le reste
		if (inFluid(camera)) {
			float t = 1 - Mth.clamp(fogStrength(camera, level), 0, 100) / 100f;
			fog.skyEnd = fog.skyEnd + (Math.max(fog.skyEnd, renderDistanceBlocks) - fog.skyEnd) * t;
			fog.cloudEnd = fog.cloudEnd + (Math.max(fog.cloudEnd, renderDistanceBlocks) - fog.cloudEnd) * t;
		}
	}
	//#endif
}
