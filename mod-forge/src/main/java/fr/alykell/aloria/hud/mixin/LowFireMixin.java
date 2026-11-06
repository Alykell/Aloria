package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.Visual;
import net.minecraft.client.renderer.ItemRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Pack « Feu bas » : les flammes affichées quand on brûle descendent vers le bas de l'écran. */
@Mixin(ItemRenderer.class)
public class LowFireMixin {
	@Inject(method = "renderFireInFirstPerson", at = @At("HEAD"), require = 0)
	private void aloriahud$lowerFire(float partialTicks, CallbackInfo ci) {
		Visual.beginFire();
	}

	@Inject(method = "renderFireInFirstPerson", at = @At("TAIL"), require = 0)
	private void aloriahud$restoreFire(float partialTicks, CallbackInfo ci) {
		Visual.endFire();
	}
}
