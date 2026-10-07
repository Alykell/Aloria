package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.Visual;
import net.minecraft.client.renderer.LightmapRenderStateExtractor;
import net.minecraft.client.renderer.state.LightmapRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Luminosité max : l'éclairage est calculé comme avec l'effet Vision nocturne, sans avoir l'effet. */
@Mixin(LightmapRenderStateExtractor.class)
public class LightmapMixin {
	@Inject(method = "extract", at = @At("TAIL"))
	private void aloriahud$fullbright(LightmapRenderState state, float partialTicks, CallbackInfo ci) {
		if (Visual.settings().fullbright) state.nightVisionEffectIntensity = 1f;
	}
}
