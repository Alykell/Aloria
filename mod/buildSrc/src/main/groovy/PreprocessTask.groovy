import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.provider.ListProperty
import org.gradle.api.provider.Property
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.InputDirectory
import org.gradle.api.tasks.OutputDirectory
import org.gradle.api.tasks.PathSensitive
import org.gradle.api.tasks.PathSensitivity
import org.gradle.api.tasks.TaskAction

/**
 * Préprocesseur multi-version : le code est écrit pour la version de référence ; les passages propres
 * à d'autres versions sont dans des blocs
 *   //#if MC >= 12111        (1.21.11 = 1*10000 + 21*100 + 11 ; 26.3 = 260300)
 *   ...
 *   //#elseif MC >= 12108
 *   //$$ ...code commenté...
 *   //#else
 *   //#endif
 * Pour la version demandée, une copie du code est produite avec les bons blocs actifs et les autres commentés.
 */
abstract class PreprocessTask extends DefaultTask {
	@InputDirectory
	@PathSensitive(PathSensitivity.RELATIVE)
	abstract DirectoryProperty getSourceDir()

	@OutputDirectory
	abstract DirectoryProperty getOutputDir()

	@Input
	abstract Property<String> getMinecraftVersion()

	/**
	 * Renommages appliqués au code de cette version, « ancien => nouveau ». Un nom simple (ex. Identifier)
	 * n'est remplacé que s'il est entier ; sinon le texte est remplacé tel quel (ex. « g.text( »).
	 */
	@Input
	abstract ListProperty<String> getRenames()

	static String rename(String text, List<String> renames) {
		for (String rule : renames) {
			def parts = rule.split('=>', 2)*.trim()
			def from = parts[0]
			def to = parts[1]
			text = from ==~ /[A-Za-z_]\w*/
				? text.replaceAll(/\b${java.util.regex.Pattern.quote(from)}\b/, java.util.regex.Matcher.quoteReplacement(to))
				: text.replace(from, to)
		}
		return text
	}

	static int mcNumber(String version) {
		def parts = version.tokenize('.').collect { it as int }
		while (parts.size() < 3) parts << 0
		return parts[0] * 10000 + parts[1] * 100 + parts[2]
	}

	static String preprocess(String text, int mc, String file) {
		def out = new StringBuilder()
		// Blocs ouverts : [actif, une branche déjà prise, parent actif]
		List<List<Boolean>> stack = []
		boolean active = true
		int n = 0
		for (String line : text.split('\n', -1)) {
			n++
			def trimmed = line.trim()
			def directive = trimmed =~ /^\/\/#(if|elseif|else|endif)\b\s*(.*)$/
			if (directive.matches()) {
				def kind = directive.group(1)
				def expr = directive.group(2).trim()
				switch (kind) {
					case 'if':
						boolean result = Eval.me('MC', mc, expr) as boolean
						stack.add([active && result, result, active])
						break
					case 'elseif':
						if (stack.isEmpty()) throw new GradleException("${file}:${n} : //#elseif sans //#if")
						def top = stack.removeLast()
						boolean result = !top[1] && (Eval.me('MC', mc, expr) as boolean)
						stack.add([top[2] && result, top[1] || result, top[2]])
						break
					case 'else':
						if (stack.isEmpty()) throw new GradleException("${file}:${n} : //#else sans //#if")
						def top = stack.removeLast()
						stack.add([top[2] && !top[1], true, top[2]])
						break
					default:
						if (stack.isEmpty()) throw new GradleException("${file}:${n} : //#endif sans //#if")
						stack.removeLast()
				}
				active = stack.isEmpty() ? true : stack.last()[0]
				out << line
			} else {
				def indent = line.takeWhile { it == ' ' || it == '\t' }
				def body = line.substring(indent.length())
				boolean commented = body.startsWith('//$$')
				if (active && commented) {
					body = body.substring(4)
					if (body.startsWith(' ')) body = body.substring(1)
					out << indent << body
				} else if (!active && !commented && !body.trim().isEmpty()) {
					out << indent << '//$$ ' << body
				} else {
					out << line
				}
			}
			out << '\n'
		}
		if (!stack.isEmpty()) throw new GradleException("${file} : //#if non fermé")
		// split(-1) ajoute une ligne vide finale : on retire le saut de ligne en trop
		return out.substring(0, out.length() - 1)
	}

	@TaskAction
	void run() {
		def source = sourceDir.get().asFile
		def output = outputDir.get().asFile
		output.deleteDir()
		int mc = mcNumber(minecraftVersion.get())
		source.eachFileRecurse(groovy.io.FileType.FILES) { File f ->
			def relative = source.toPath().relativize(f.toPath()).toString()
			def target = new File(output, relative)
			target.parentFile.mkdirs()
			target.setText(rename(preprocess(f.getText('UTF-8'), mc, relative), renames.get()), 'UTF-8')
		}
	}
}
