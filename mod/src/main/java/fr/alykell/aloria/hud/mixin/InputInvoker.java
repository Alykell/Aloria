package fr.alykell.aloria.hud.mixin;

import net.minecraft.client.MouseHandler;
import org.spongepowered.asm.mixin.Mixin;
//#if MC < 260000
//$$ import org.spongepowered.asm.mixin.gen.Invoker;
//#if MC >= 12109
//$$ import net.minecraft.client.input.MouseButtonInfo;
//#endif
//#endif

/**
 * Auto-test en 1.21.x : souris simulée. En jeu obfusqué, la réflexion par nom ne marche pas :
 * ces invokers, eux, sont remappés. En 26.x l'auto-test appelle les méthodes par réflexion (interface vide).
 */
@Mixin(MouseHandler.class)
public interface InputInvoker {
	//#if MC < 260000
	//$$ @Invoker("onMove")
	//$$ void invokeOnMove(long window, double x, double y);
	//$$
	//#if MC >= 12109
	//$$ @Invoker("onButton")
	//$$ void invokeOnButton(long window, MouseButtonInfo info, int action);
	//#else
	//$$ @Invoker("onPress")
	//$$ void invokeOnPress(long window, int button, int action, int mods);
	//#endif
	//#endif
}
