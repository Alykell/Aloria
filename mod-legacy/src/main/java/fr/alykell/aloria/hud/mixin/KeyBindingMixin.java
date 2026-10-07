package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.Stats;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.KeyBinding;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Compte les clics en jeu pour le CPS (pas dans les menus) : codes -100 (gauche) et -99 (droit). */
@Mixin(KeyBinding.class)
public class KeyBindingMixin {
	@Inject(method = "onKeyPressed", at = @At("HEAD"))
	private static void aloriahud$countClick(int keyCode, CallbackInfo ci) {
		if (MinecraftClient.getInstance().currentScreen == null) Stats.onClick(keyCode);
	}
}
