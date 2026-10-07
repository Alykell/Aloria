package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.Visual;
import net.minecraft.client.Camera;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.fog.FogData;
import net.minecraft.client.renderer.fog.FogRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
//#if MC >= 260000
import net.minecraft.client.DeltaTracker;
//#else
//$$ import com.llamalad7.mixinextras.sugar.Local;
//$$ import org.joml.Vector4f;
//#endif

/** Brouillard réglable par dimension et par liquide. */
@Mixin(FogRenderer.class)
public class FogMixin {
	//#if MC >= 260000
	@Inject(method = "setupFog", at = @At("RETURN"))
	private void aloriahud$adjustFog(Camera camera, int renderDistanceInChunks, DeltaTracker deltaTracker, float darkenWorldAmount, ClientLevel level,
		CallbackInfoReturnable<FogData> cir) {
		Visual.applyFog(cir.getReturnValue(), camera, level, renderDistanceInChunks * 16);
	}
	//#else
	//$$ /** En 1.21.x, le brouillard est envoyé à la carte graphique dans la même méthode : on le modifie juste avant */
	//$$ @Inject(method = "setupFog", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/fog/FogRenderer;updateBuffer(Ljava/nio/ByteBuffer;ILorg/joml/Vector4f;FFFFFF)V"))
	//$$ private void aloriahud$adjustFog(CallbackInfoReturnable<Vector4f> cir, @Local FogData fog, @Local(argsOnly = true) Camera camera,
	//$$ 	@Local(argsOnly = true) ClientLevel level, @Local(argsOnly = true) int renderDistanceInChunks) {
	//$$ 	Visual.applyFog(fog, camera, level, renderDistanceInChunks * 16);
	//$$ }
	//#endif
}
