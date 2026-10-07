package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.AloriaHud;
import net.minecraft.client.MinecraftClient;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Fin de chaque tick : statistiques et touche du menu. */
@Mixin(MinecraftClient.class)
public class MinecraftClientMixin {
	@Inject(method = "tick", at = @At("TAIL"))
	private void aloriahud$tick(CallbackInfo ci) {
		AloriaHud.tick((MinecraftClient) (Object) this);
	}
}
