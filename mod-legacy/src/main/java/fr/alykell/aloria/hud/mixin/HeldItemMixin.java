package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.Visual;
import net.minecraft.client.render.item.HeldItemRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Écran Visuel : position et taille de la main (et de l'objet tenu) en vue à la première personne. */
@Mixin(HeldItemRenderer.class)
public class HeldItemMixin {
	@Inject(method = "renderArmHoldingItem", at = @At(value = "INVOKE", target = "Lcom/mojang/blaze3d/platform/GlStateManager;pushMatrix()V",
		shift = At.Shift.AFTER, ordinal = 0))
	private void aloriahud$transformHand(float tickDelta, CallbackInfo ci) {
		Visual.transformHand();
	}
}
