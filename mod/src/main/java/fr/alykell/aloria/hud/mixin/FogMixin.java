package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.Visual;
import net.minecraft.client.Camera;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.fog.FogData;
import net.minecraft.client.renderer.fog.FogRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Brouillard réglable par dimension et par liquide. */
@Mixin(FogRenderer.class)
public class FogMixin {
	@Inject(method = "setupFog", at = @At("RETURN"))
	private void aloriahud$adjustFog(Camera camera, int renderDistanceInChunks, DeltaTracker deltaTracker, float darkenWorldAmount, ClientLevel level,
		CallbackInfoReturnable<FogData> cir) {
		Visual.applyFog(cir.getReturnValue(), camera, level, renderDistanceInChunks * 16);
	}
}
