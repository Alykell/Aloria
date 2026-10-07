package fr.alykell.aloria.hud.mixin;

import com.llamalad7.mixinextras.sugar.Local;
import com.mojang.blaze3d.vertex.PoseStack;
import fr.alykell.aloria.hud.Visual;
//#if MC >= 12106
import net.minecraft.client.renderer.ScreenEffectRenderer;
//#else
//$$ import net.minecraft.client.renderer.GameRenderer;
//#endif
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Taille de l'animation du totem d'immortalité (paramètres différents en 26.2 et 26.3 : PoseStack repéré par son type). */
//#if MC >= 12106
@Mixin(ScreenEffectRenderer.class)
//#else
//$$ @Mixin(GameRenderer.class)
//#endif
public class TotemMixin {
	@Inject(method = "renderItemActivationAnimation", at = @At(value = "INVOKE", target = "Lcom/mojang/blaze3d/vertex/PoseStack;scale(FFF)V", shift = At.Shift.AFTER))
	//#if MC >= 12106
	private void aloriahud$scaleTotem(CallbackInfo ci, @Local(argsOnly = true) PoseStack pose) {
	//#else
	//$$ // Avant 1.21.6 : dans GameRenderer, le PoseStack est une variable locale
	//$$ private void aloriahud$scaleTotem(CallbackInfo ci, @Local PoseStack pose) {
	//#endif
		Visual.scaleTotem(pose);
	}
}
