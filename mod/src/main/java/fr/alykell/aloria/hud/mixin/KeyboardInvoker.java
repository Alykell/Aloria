package fr.alykell.aloria.hud.mixin;

import net.minecraft.client.KeyboardHandler;
import org.spongepowered.asm.mixin.Mixin;
//#if MC < 260000
//$$ import org.spongepowered.asm.mixin.gen.Invoker;
//#if MC >= 12109
//$$ import net.minecraft.client.input.CharacterEvent;
//#endif
//#endif

/** Auto-test en 1.21.x : texte tapé au clavier (voir InputInvoker). Vide en 26.x. */
@Mixin(KeyboardHandler.class)
public interface KeyboardInvoker {
	//#if MC < 260000
	//#if MC >= 12109
	//$$ @Invoker("charTyped")
	//$$ void invokeCharTyped(long window, CharacterEvent event);
	//#else
	//$$ @Invoker("charTyped")
	//$$ void invokeCharTyped(long window, int codePoint, int mods);
	//#endif
	//#endif
}
