package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.Visual;
import net.minecraft.client.renderer.ItemRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Écran Visuel : position et taille de la main en vue à la première personne (sans effet si OptiFine a réécrit ce rendu). */
@Mixin(ItemRenderer.class)
public class HeldItemMixin {
	@Inject(method = "renderItemInFirstPerson", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/GlStateManager;pushMatrix()V",
		shift = At.Shift.AFTER, ordinal = 0), require = 0)
	private void aloriahud$transformHand(float partialTicks, CallbackInfo ci) {
		Visual.transformHand();
	}
}
