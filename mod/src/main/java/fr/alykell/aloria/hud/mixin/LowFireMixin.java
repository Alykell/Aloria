package fr.alykell.aloria.hud.mixin;

import com.llamalad7.mixinextras.sugar.Local;
import com.mojang.blaze3d.vertex.PoseStack;
import fr.alykell.aloria.hud.Visual;
import net.minecraft.client.renderer.ScreenEffectRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Pack « Feu bas » : les flammes affichées quand on brûle descendent vers le bas de l'écran.
 * La méthode change de nom et d'arguments selon la version ; seule la pile de transformations compte.
 */
@Mixin(ScreenEffectRenderer.class)
public class LowFireMixin {
	//#if MC >= 260200
	@Inject(method = "submitFire", at = @At("HEAD"))
	//#else
	//$$ @Inject(method = "renderFire", at = @At("HEAD"))
	//#endif
	private static void aloriahud$lowerFire(CallbackInfo ci, @Local(argsOnly = true) PoseStack poseStack) {
		poseStack.pushPose();
		if (Visual.settings().lowFire) poseStack.translate(0.0F, -Visual.LOW_FIRE_OFFSET, 0.0F);
	}

	//#if MC >= 260200
	@Inject(method = "submitFire", at = @At("TAIL"))
	//#else
	//$$ @Inject(method = "renderFire", at = @At("TAIL"))
	//#endif
	private static void aloriahud$restoreFire(CallbackInfo ci, @Local(argsOnly = true) PoseStack poseStack) {
		poseStack.popPose();
	}
}
