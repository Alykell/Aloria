package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.Visual;
import net.minecraft.client.Camera;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
//#if MC >= 260000
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.fog.FogData;
import net.minecraft.client.renderer.fog.FogRenderer;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
//#elseif MC >= 12106
//$$ import com.llamalad7.mixinextras.sugar.Local;
//$$ import net.minecraft.client.multiplayer.ClientLevel;
//$$ import net.minecraft.client.renderer.fog.FogData;
//$$ import net.minecraft.client.renderer.fog.FogRenderer;
//$$ import org.joml.Vector4f;
//$$ import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
//#elseif MC >= 12102
//$$ import net.minecraft.client.Minecraft;
//$$ import net.minecraft.client.renderer.FogParameters;
//$$ import net.minecraft.client.renderer.FogRenderer;
//$$ import org.joml.Vector4f;
//$$ import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
//#else
//$$ import com.mojang.blaze3d.systems.RenderSystem;
//$$ import net.minecraft.client.Minecraft;
//$$ import net.minecraft.client.renderer.FogRenderer;
//$$ import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
//#endif

/** Brouillard réglable par dimension et par liquide (voir Visual.adjustedFog). */
@Mixin(FogRenderer.class)
public class FogMixin {
	//#if MC >= 260000
	@Inject(method = "setupFog", at = @At("RETURN"))
	private void aloriahud$adjustFog(Camera camera, int renderDistanceInChunks, DeltaTracker deltaTracker, float darkenWorldAmount, ClientLevel level,
		CallbackInfoReturnable<FogData> cir) {
		Visual.applyFog(cir.getReturnValue(), camera, level, renderDistanceInChunks * 16);
	}
	//#elseif MC >= 12106
	//$$ /** 1.21.6 à 1.21.11 : le brouillard est envoyé à la carte graphique dans la même méthode, on le modifie juste avant */
	//$$ @Inject(method = "setupFog", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/fog/FogRenderer;updateBuffer(Ljava/nio/ByteBuffer;ILorg/joml/Vector4f;FFFFFF)V"))
	//$$ private void aloriahud$adjustFog(CallbackInfoReturnable<Vector4f> cir, @Local FogData fog, @Local(argsOnly = true) Camera camera,
	//$$ 	@Local(argsOnly = true) ClientLevel level, @Local(argsOnly = true) int renderDistanceInChunks) {
	//$$ 	Visual.applyFog(fog, camera, level, renderDistanceInChunks * 16);
	//$$ }
	//#elseif MC >= 12102
	//$$ /** 1.21.2 à 1.21.5 : les paramètres du brouillard sont renvoyés par la méthode, on les remplace */
	//$$ @Inject(method = "setupFog", at = @At("RETURN"), cancellable = true)
	//$$ private static void aloriahud$adjustFog(Camera camera, FogRenderer.FogMode mode, Vector4f color, float renderDistance, boolean thickFog,
	//$$ 	float partialTick, CallbackInfoReturnable<FogParameters> cir) {
	//$$ 	FogParameters fog = cir.getReturnValue();
	//$$ 	if (fog == FogParameters.NO_FOG || Minecraft.getInstance().level == null) return;
	//$$ 	float[] adjusted = Visual.adjustedFog(camera, Minecraft.getInstance().level, fog.start(), fog.end(), renderDistance);
	//$$ 	if (adjusted != null) {
	//$$ 		cir.setReturnValue(new FogParameters(adjusted[0], adjusted[1], fog.shape(), fog.red(), fog.green(), fog.blue(), fog.alpha()));
	//$$ 	}
	//$$ }
	//#else
	//$$ /** 1.20 et 1.21.1 : la méthode règle directement le brouillard du rendu, on le corrige à la fin */
	//$$ @Inject(method = "setupFog", at = @At("TAIL"))
	//$$ private static void aloriahud$adjustFog(Camera camera, FogRenderer.FogMode mode, float renderDistance, boolean thickFog, float partialTick,
	//$$ 	CallbackInfo ci) {
	//$$ 	if (Minecraft.getInstance().level == null) return;
	//$$ 	float[] adjusted = Visual.adjustedFog(camera, Minecraft.getInstance().level, RenderSystem.getShaderFogStart(), RenderSystem.getShaderFogEnd(), renderDistance);
	//$$ 	if (adjusted != null) {
	//$$ 		RenderSystem.setShaderFogStart(adjusted[0]);
	//$$ 		RenderSystem.setShaderFogEnd(adjusted[1]);
	//$$ 	}
	//$$ }
	//#endif
}
