package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.screen.HudMenuScreen;
import net.minecraft.client.gui.GuiButton;
import net.minecraft.client.gui.GuiIngameMenu;
import net.minecraft.client.gui.GuiScreen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Bouton « Aloria HUD » dans le menu Échap, sous les autres boutons. */
@Mixin(GuiIngameMenu.class)
public abstract class GameMenuScreenMixin extends GuiScreen {
	private static final int BUTTON_ID = 4242;

	@Inject(method = "initGui", at = @At("TAIL"))
	private void aloriahud$addButton(CallbackInfo ci) {
		int bottom = height / 2;
		for (GuiButton b : buttonList) bottom = Math.max(bottom, b.yPosition + 20);
		buttonList.add(new GuiButton(BUTTON_ID, width / 2 - 100, Math.min(bottom + 8, height - 24), 200, 20, "Aloria HUD"));
	}

	@Inject(method = "actionPerformed", at = @At("HEAD"), cancellable = true)
	private void aloriahud$click(GuiButton button, CallbackInfo ci) {
		if (button.id != BUTTON_ID) return;
		mc.displayGuiScreen(new HudMenuScreen(this));
		ci.cancel();
	}
}
