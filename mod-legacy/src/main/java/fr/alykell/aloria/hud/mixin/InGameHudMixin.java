package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.HudRenderer;
import net.minecraft.client.gui.hud.InGameHud;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Dessine les modules à la fin du HUD du jeu. */
@Mixin(InGameHud.class)
public class InGameHudMixin {
	@Inject(method = "render", at = @At("TAIL"))
	private void aloriahud$render(float tickDelta, CallbackInfo ci) {
		HudRenderer.render(tickDelta);
	}
}
