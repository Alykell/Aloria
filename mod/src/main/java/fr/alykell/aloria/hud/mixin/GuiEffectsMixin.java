package fr.alykell.aloria.hud.mixin;

import net.minecraft.client.gui.Gui;
import org.spongepowered.asm.mixin.Mixin;
//#if MC < 12106
//$$ import fr.alykell.aloria.hud.AloriaHud;
//$$ import org.spongepowered.asm.mixin.injection.At;
//$$ import org.spongepowered.asm.mixin.injection.Inject;
//$$ import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
//#endif

/**
 * Avant 1.21.6 : cache les icônes d'effets de Minecraft (en haut à droite) quand le module Effets les remplace.
 * Depuis 1.21.6, le registre du HUD de Fabric s'en charge (AloriaHud) : classe vide.
 */
@Mixin(Gui.class)
public class GuiEffectsMixin {
	//#if MC < 12106
	//$$ @Inject(method = "renderEffects", at = @At("HEAD"), cancellable = true)
	//$$ private void aloriahud$hideVanillaEffects(CallbackInfo ci) {
	//$$ 	if (AloriaHud.effectsModuleEnabled()) ci.cancel();
	//$$ }
	//#endif
}
