package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.HudRenderer;
import net.minecraftforge.client.GuiIngameForge;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Dessine les modules à la fin du HUD du jeu (Forge remplace celui du jeu par le sien, GuiIngameForge). */
@Mixin(GuiIngameForge.class)
public class InGameHudMixin {
	@Inject(method = "renderGameOverlay", at = @At("TAIL"))
	private void aloriahud$render(float partialTicks, CallbackInfo ci) {
		HudRenderer.render(partialTicks);
	}
}
