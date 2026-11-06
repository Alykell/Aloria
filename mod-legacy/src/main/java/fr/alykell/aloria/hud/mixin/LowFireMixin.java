package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.Visual;
import net.minecraft.client.render.item.HeldItemRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Pack « Feu bas » : les flammes affichées quand on brûle descendent vers le bas de l'écran. */
@Mixin(HeldItemRenderer.class)
public class LowFireMixin {
	@Inject(method = "renderFireOverlay", at = @At("HEAD"))
	private void aloriahud$lowerFire(float tickDelta, CallbackInfo ci) {
		Visual.beginFire();
	}

	@Inject(method = "renderFireOverlay", at = @At("TAIL"))
	private void aloriahud$restoreFire(float tickDelta, CallbackInfo ci) {
		Visual.endFire();
	}
}
