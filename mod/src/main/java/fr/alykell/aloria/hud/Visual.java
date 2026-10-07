package fr.alykell.aloria.hud;

import com.mojang.blaze3d.vertex.PoseStack;
import fr.alykell.aloria.hud.config.VisualSettings;
import fr.alykell.aloria.hud.config.VisualSettings.HandTransform;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.fog.FogData;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.HumanoidArm;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.material.FogType;

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

	/**
	 * Éloigne le brouillard selon le réglage (0 % = plus du tout).
	 * Cécité et Obscurité ne sont jamais touchées : ce sont des effets de jeu, pas du décor.
	 */
	public static void applyFog(FogData fog, Camera camera, ClientLevel level, float renderDistanceBlocks) {
		int strength = Math.clamp(fogStrength(camera, level), 0, 100);
		if (strength >= 100) return;
		if (camera.entity() instanceof LivingEntity living
			&& (living.hasEffect(MobEffects.BLINDNESS) || living.hasEffect(MobEffects.DARKNESS))) return;

		boolean inFluid = camera.getFluidInCamera() != FogType.NONE && camera.getFluidInCamera() != FogType.ATMOSPHERIC;
		float t = 1 - strength / 100f;
		if (strength == 0) {
			fog.environmentalStart = Float.MAX_VALUE;
			fog.environmentalEnd = Float.MAX_VALUE;
		} else {
			// Progression géométrique : la lave (1 bloc de visibilité) et le Nether (une centaine) réagissent pareil au curseur
			float end = Math.max(0.5f, fog.environmentalEnd);
			float target = Math.max(end, renderDistanceBlocks * 2);
			float newEnd = (float) (end * Math.pow(target / end, t));
			fog.environmentalStart = fog.environmentalStart + (newEnd * 0.6f - fog.environmentalStart) * t;
			fog.environmentalEnd = newEnd;
		}
		// Dans un liquide, le ciel et les nuages sont aussi cachés par le brouillard : on les rend avec le reste
		if (inFluid) {
			fog.skyEnd = fog.skyEnd + (Math.max(fog.skyEnd, renderDistanceBlocks) - fog.skyEnd) * t;
			fog.cloudEnd = fog.cloudEnd + (Math.max(fog.cloudEnd, renderDistanceBlocks) - fog.cloudEnd) * t;
		}
	}
}
