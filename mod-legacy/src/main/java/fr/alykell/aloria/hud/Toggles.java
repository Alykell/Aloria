package fr.alykell.aloria.hud;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.KeyBinding;

/** Courir et s'accroupir « en bascule » (un appui active, un autre désactive), comme en 1.13+. */
public final class Toggles {
	private static boolean sprinting;
	private static boolean sneaking;

	private Toggles() {
	}

	public static void tick(MinecraftClient mc) {
		if (mc.options == null) return;
		while (mc.options.sprintKey.wasPressed()) {
			if (LegacyOptions.toggleSprint && mc.currentScreen == null) sprinting = !sprinting;
		}
		while (mc.options.sneakKey.wasPressed()) {
			if (LegacyOptions.toggleCrouch && mc.currentScreen == null) sneaking = !sneaking;
		}
		if (!LegacyOptions.toggleSprint || mc.player == null) sprinting = false;
		if (!LegacyOptions.toggleCrouch || mc.player == null) sneaking = false;
	}

	/** État forcé d'une touche en bascule, ou null pour laisser le jeu lire la touche */
	public static Boolean override(KeyBinding key) {
		MinecraftClient mc = MinecraftClient.getInstance();
		if (mc == null || mc.options == null) return null;
		if (key == mc.options.sprintKey && LegacyOptions.toggleSprint) return sprinting;
		if (key == mc.options.sneakKey && LegacyOptions.toggleCrouch) return sneaking;
		return null;
	}

	/** Pour l'affichage : « Course (bascule) » / « Accroupi (bascule) » */
	public static boolean sprinting() {
		return sprinting;
	}

	public static boolean sneaking() {
		return sneaking;
	}
}
