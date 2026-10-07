package fr.alykell.aloria.hud.mixin;

import com.llamalad7.mixinextras.sugar.Local;
import com.mojang.blaze3d.vertex.PoseStack;
import fr.alykell.aloria.hud.Visual;
import net.minecraft.client.renderer.ScreenEffectRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Taille de l'animation du totem d'immortalité (paramètres différents en 26.2 et 26.3 : PoseStack repéré par son type). */
@Mixin(ScreenEffectRenderer.class)
public class TotemMixin {
	@Inject(method = "renderItemActivationAnimation", at = @At(value = "INVOKE", target = "Lcom/mojang/blaze3d/vertex/PoseStack;scale(FFF)V", shift = At.Shift.AFTER))
	private void aloriahud$scaleTotem(CallbackInfo ci, @Local(argsOnly = true) PoseStack pose) {
		Visual.scaleTotem(pose);
	}
}
